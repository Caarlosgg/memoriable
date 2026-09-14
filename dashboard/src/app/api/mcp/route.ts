import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { resolveApiToken } from "@/lib/apiTokens";
import { getPersonalWorkspaceId } from "@/lib/workspace";
import { searchMessages, SEARCH_PAGE_SIZE } from "@/lib/data";
import { captureMessage } from "@/lib/pipeline";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 30;

/** Mismos topes y misma ventana que /api/v1/notas — es el MISMO cupo de token, no uno nuevo por transporte. */
const LIMITE_ESCRITURA = 60;
const LIMITE_LECTURA = 600;
const VENTANA_MS = 60 * 60 * 1000;
/** Igual que en /api/v1/notas: el mismo tope que aplica el saneado del pipeline. */
const MAX_CONTENIDO = 10_000;

/**
 * Servidor MCP de MemorIAble — "la memoria de la que tiran tus otras IAs"
 * (Claude Desktop, Claude Code, Cursor, cualquier cliente MCP), sin tener
 * que abrir el dashboard ni escribirle al bot.
 *
 * Es casi un refactor puro de `/api/v1/notas`, no una superficie nueva:
 * MISMA autenticación (token personal por `Authorization: Bearer`), MISMO
 * alcance (el espacio PERSONAL del dueño del token — ver el razonamiento
 * en ese fichero, vale igual aquí), MISMOS límites por hora, y las MISMAS
 * funciones de `lib/` (`searchMessages`, `captureMessage`). Dos
 * transportes sobre el mismo cerebro, igual que `/api/asistente` y
 * `/api/bot/asistente`.
 *
 * Vive en el propio dashboard (no un servicio aparte): se despliega solo
 * con cada push a Vercel, sin infraestructura ni pasos manuales nuevos.
 */
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "buscar_notas",
      {
        title: "Buscar notas",
        description:
          "Busca en las notas, tareas y recordatorios guardados en MemorIAble, por palabras o por significado (búsqueda híbrida). Sin `q`, devuelve las más recientes.",
        inputSchema: z.object({
          q: z.string().trim().optional().describe("Qué buscar, en lenguaje natural. Vacío = las más recientes."),
          limite: z.number().int().positive().max(SEARCH_PAGE_SIZE * 4).optional(),
        }),
      },
      async ({ q, limite }, { http }) => {
        const userId = http?.authInfo?.extra?.userId as string | undefined;
        if (!userId) throw new Error("No autorizado.");

        const limite429 = await checkRateLimit(`api:lectura:${userId}`, LIMITE_LECTURA, VENTANA_MS);
        if (!limite429.allowed) {
          throw new Error(`Demasiadas peticiones. Reinténtalo en ${limite429.retryAfterSeconds}s.`);
        }

        const workspaceId = await getPersonalWorkspaceId(userId);
        const { messages, total, hayMas } = await searchMessages(workspaceId, q?.trim() ?? "", {}, limite ?? SEARCH_PAGE_SIZE);

        const notas = messages.map((m) => ({
          id: m.id,
          contenido: m.contenido,
          resumen: m.resumen,
          categoria: m.categoria,
          hecho: m.hecho,
          fecha: m.fecha.toISOString(),
          fechaLimite: m.fechaLimite?.toISOString() ?? null,
        }));

        return { content: [{ type: "text", text: JSON.stringify({ notas, total, hayMas }) }] };
      },
    );

    server.registerTool(
      "crear_nota",
      {
        title: "Crear nota",
        description:
          "Guarda una nota, tarea, idea, pregunta o recordatorio nuevo en MemorIAble, categorizándolo automáticamente (mismo pipeline que la captura web y el bot de Telegram).",
        inputSchema: z.object({
          contenido: z
            .string()
            .trim()
            .min(1)
            .max(MAX_CONTENIDO)
            .describe("El texto tal cual, listo para guardar y categorizar."),
        }),
      },
      async ({ contenido }, { http }) => {
        const userId = http?.authInfo?.extra?.userId as string | undefined;
        if (!userId) throw new Error("No autorizado.");

        const limite429 = await checkRateLimit(`api:escritura:${userId}`, LIMITE_ESCRITURA, VENTANA_MS);
        if (!limite429.allowed) {
          throw new Error(`Demasiadas peticiones. Reinténtalo en ${limite429.retryAfterSeconds}s.`);
        }

        const workspaceId = await getPersonalWorkspaceId(userId);
        try {
          const saved = await captureMessage(userId, contenido, workspaceId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ nota: { id: saved.id, resumen: saved.resumen, categoria: saved.categoria } }),
              },
            ],
          };
        } catch (err) {
          console.error("No se pudo crear la nota por MCP:", err);
          throw new Error("No se ha podido guardar la nota.");
        }
      },
    );
  },
  { serverInfo: { name: "memoriable", version: "1.0.0" } },
);

const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const resuelto = await resolveApiToken(bearerToken);
    if (!resuelto) return undefined;
    // `clientId`/`scopes` son del modelo OAuth que espera el SDK, pero este
    // servidor usa el mismo token personal simple que /api/v1/notas — no
    // hay alcances que repartir, solo "el token vale o no vale". `extra` es
    // donde de verdad viaja lo que hace falta: el dueño del token.
    return { token: bearerToken, clientId: resuelto.userId, scopes: ["notas"], extra: { userId: resuelto.userId } };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
