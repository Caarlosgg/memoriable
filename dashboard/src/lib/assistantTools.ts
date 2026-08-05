import "server-only";
import { revalidatePath } from "next/cache";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { captureMessage } from "./pipeline";
import { toAssistantSource } from "./assistantContext";
import { prisma } from "./prisma";

export interface CrearEventoResult {
  id: string;
  titulo: string;
  fechaInicio: string;
  ubicacion: string | null;
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
  } satisfies ToolSet;
}

export type AssistantTools = ReturnType<typeof createAssistantTools>;
