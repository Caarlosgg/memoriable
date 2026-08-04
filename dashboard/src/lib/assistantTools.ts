import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { captureMessage } from "./pipeline";
import { toAssistantSource } from "./assistantContext";

/**
 * Herramientas que dejan al Asistente actuar de verdad (no solo responder).
 * Definidas aparte de api/asistente/route.ts para poder importar SOLO su
 * tipo (`InferUITools`) desde el cliente sin arrastrar código de servidor
 * al bundle — un `import type` se borra en compilación, así que no rompe
 * el límite server-only pese a venir del mismo módulo.
 */
export const assistantTools = {
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
      const saved = await captureMessage(contenido);
      return toAssistantSource(saved);
    },
  }),
} satisfies ToolSet;
