import "server-only";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Message } from "@prisma/client";
import { captureMessage, resolveEmbedder } from "./pipeline";
import { toAssistantSource } from "./assistantContext";
import { ACTIONABLE_CATEGORIES } from "./categories";
import { findSimilarMessages } from "./vectorSearch";
import { prisma } from "./prisma";

export interface CrearEventoResult {
  id: string;
  titulo: string;
  fechaInicio: string;
  ubicacion: string | null;
}

export interface CompletarTareaResult {
  id: string;
  resumen: string;
  categoria: string;
}

function isPendienteAccionable(m: Message): boolean {
  return (ACTIONABLE_CATEGORIES as readonly string[]).includes(m.categoria) && m.estado !== "HECHO";
}

/**
 * Busca, entre las tareas/recordatorios pendientes del usuario, la que
 * mejor coincide con una descripción libre. Semántica primero (misma
 * infraestructura que las fuentes citadas del propio Asistente) porque el
 * usuario rara vez repite el texto exacto de la nota original ("ya he
 * llamado al fontanero" vs. "Llamar al fontanero para revisar la
 * caldera") — un ILIKE de texto exacto fallaría casi siempre. Cae a texto
 * si no hay embedder configurado o no encontró nada.
 */
async function encontrarTareaPendiente(userId: string, descripcion: string): Promise<Message | null> {
  try {
    const embedding = await resolveEmbedder().embedQuery(descripcion);
    if (embedding) {
      const similares = await findSimilarMessages(userId, embedding, { limit: 8 });
      const match = similares.find(isPendienteAccionable);
      if (match) return match;
    }
  } catch (err) {
    console.error("No se pudo buscar la tarea semánticamente (se prueba con texto):", err);
  }

  return prisma.message.findFirst({
    where: {
      userId,
      categoria: { in: [...ACTIONABLE_CATEGORIES] },
      estado: { not: "HECHO" },
      OR: [
        { contenido: { contains: descripcion, mode: "insensitive" } },
        { resumen: { contains: descripcion, mode: "insensitive" } },
      ],
    },
    orderBy: { fecha: "desc" },
  });
}

/**
 * Herramientas que dejan al Asistente actuar de verdad (no solo responder).
 * Fábrica (no un objeto estático) porque cada tool necesita saber para qué
 * usuario está guardando — se liga al userId de la sesión ya verificada en
 * la ruta, nunca al de un mensaje o input del propio modelo.
 *
 * Definidas aparte de api/asistente/route.ts para poder importar SOLO su
 * tipo (`InferUITools`) desde el cliente sin arrastrar código de servidor
 * al bundle — un `import type` se borra en compilación, así que no rompe
 * el límite server-only pese a venir del mismo módulo.
 */
export function createAssistantTools(userId: string) {
  return {
    crearNota: tool({
      description:
        "Crea y guarda una nota, tarea o recordatorio nuevo, categorizándolo automáticamente (igual que la captura rápida del dashboard). Llámala directamente en el mismo turno cuando el usuario pida crear, apuntar, anotar o recordar algo — no preguntes primero si quiere que lo hagas. Si lo que pide tiene fecha y hora concretas (una cita, quedar con alguien), usa crearEvento en su lugar.",
      inputSchema: z.object({
        contenido: z
          .string()
          .min(1)
          .describe("El texto de la nota/tarea/recordatorio tal como lo diría el usuario, listo para guardar y categorizar."),
      }),
      execute: async ({ contenido }) => {
        let saved;
        try {
          saved = await captureMessage(userId, contenido);
        } catch (err) {
          console.error("La tool crearNota no pudo guardar la nota:", err);
          Sentry.captureException(err);
          // Mensaje ya en español y sin detalles internos: el AI SDK lo
          // expone como `errorText` del part, que la UI muestra tal cual
          // (ver CrearNotaResult en AssistantChat.tsx).
          throw new Error("No se ha podido guardar la nota. Inténtalo de nuevo en un momento.");
        }
        // Invalidar la caché no es crítico: si falla, la nota YA está guardada
        // — no convertir un guardado correcto en un error de cara al usuario.
        // (Sin esto, navegar a Tablero/Categorías tras crearla podría enseñar
        // la versión cacheada de antes; el chat vive en otra pestaña.)
        try {
          revalidatePath("/pendientes");
          revalidatePath("/categorias");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras crear la nota (no crítico):", err);
        }
        return toAssistantSource(saved);
      },
    }),
    crearEvento: tool({
      description:
        "Crea una cita o evento con fecha y hora concreta en el calendario del usuario. Llámala cuando describa algo con fecha/hora clara (\"quedar el jueves a las 5\", \"cita con el médico el 12 a las 10\"). Si falta la hora o la fecha es ambigua, pregunta antes de llamarla — nunca inventes una hora que no te han dado.",
      inputSchema: z.object({
        titulo: z.string().min(1).describe("Título corto del evento."),
        fechaInicio: z
          .string()
          .describe("Fecha y hora de inicio en formato ISO 8601 (con zona horaria si se conoce)."),
        fechaFin: z.string().optional().describe("Fecha y hora de fin, solo si el usuario la menciona."),
        descripcion: z.string().optional(),
        ubicacion: z.string().optional(),
        participantes: z
          .array(z.string())
          .optional()
          .describe("Nombres de las personas mencionadas, si las hay."),
      }),
      execute: async ({ titulo, fechaInicio, fechaFin, descripcion, ubicacion, participantes }) => {
        const fecha = new Date(fechaInicio);
        if (Number.isNaN(fecha.getTime())) {
          throw new Error("No he entendido bien la fecha. ¿Puedes decírmela de otra forma (día y hora)?");
        }
        const fin = fechaFin ? new Date(fechaFin) : null;
        if (fin && Number.isNaN(fin.getTime())) {
          throw new Error("No he entendido bien la fecha de fin.");
        }

        let evento;
        try {
          evento = await prisma.evento.create({
            data: {
              userId,
              titulo,
              fechaInicio: fecha,
              fechaFin: fin,
              descripcion: descripcion ?? null,
              ubicacion: ubicacion ?? null,
              participantes: participantes ?? [],
            },
          });
        } catch (err) {
          console.error("La tool crearEvento no pudo guardar el evento:", err);
          Sentry.captureException(err);
          throw new Error("No se ha podido guardar el evento. Inténtalo de nuevo en un momento.");
        }

        try {
          revalidatePath("/calendario");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras crear el evento (no crítico):", err);
        }

        const result: CrearEventoResult = {
          id: evento.id,
          titulo: evento.titulo,
          fechaInicio: evento.fechaInicio.toISOString(),
          ubicacion: evento.ubicacion,
        };
        return result;
      },
    }),
    completarTarea: tool({
      description:
        "Marca como hecha una tarea o recordatorio pendiente que el usuario dice haber terminado (\"ya he llamado al fontanero\", \"acabé lo del informe\", \"hecho lo de comprar el regalo\"). Busca entre sus pendientes la que mejor coincide con la descripción. Si no hay ninguna coincidencia razonable, dilo con naturalidad — no la llames de nuevo adivinando otra cosa.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .min(1)
          .describe("Descripción de la tarea tal como la menciona el usuario, para buscarla entre sus pendientes."),
      }),
      execute: async ({ descripcion }) => {
        let tarea: Message | null;
        try {
          tarea = await encontrarTareaPendiente(userId, descripcion);
        } catch (err) {
          console.error("La tool completarTarea no pudo buscar la tarea:", err);
          Sentry.captureException(err);
          throw new Error("No he podido buscar entre tus pendientes. Inténtalo de nuevo en un momento.");
        }
        if (!tarea) {
          throw new Error("No he encontrado ninguna tarea pendiente que coincida con eso.");
        }

        try {
          await prisma.message.update({ where: { id: tarea.id }, data: { estado: "HECHO", hecho: true } });
        } catch (err) {
          console.error("La tool completarTarea no pudo marcarla como hecha:", err);
          Sentry.captureException(err);
          throw new Error("No se ha podido marcar como hecha. Inténtalo de nuevo en un momento.");
        }

        try {
          revalidatePath("/pendientes");
          revalidatePath("/categorias");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras completar la tarea (no crítico):", err);
        }

        const result: CompletarTareaResult = { id: tarea.id, resumen: tarea.resumen, categoria: tarea.categoria };
        return result;
      },
    }),
  } satisfies ToolSet;
}

export type AssistantTools = ReturnType<typeof createAssistantTools>;
