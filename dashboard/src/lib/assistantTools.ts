import "server-only";
import { revalidatePath } from "next/cache";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { captureMessage } from "./pipeline";
import { toAssistantSource } from "./assistantContext";

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
        "Crea y guarda una nota, tarea o recordatorio nuevo, categorizándolo automáticamente (igual que la captura rápida del dashboard). Llámala directamente en el mismo turno cuando el usuario pida crear, apuntar, anotar o recordar algo — no preguntes primero si quiere que lo hagas.",
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
  } satisfies ToolSet;
}

export type AssistantTools = ReturnType<typeof createAssistantTools>;
