import "server-only";
import Groq from "groq-sdk";
import { processMessage } from "./botPipeline/processMessage";
import { GroqCategorizer, type GroqChatClient } from "./botPipeline/categorizer";
import { OfflineCategorizer } from "./botPipeline/offlineCategorizer";
import { ResilientCategorizer } from "./botPipeline/resilientCategorizer";
import { GeminiEmbedder, NullEmbedder } from "./botPipeline/embedder";
import type { Categorizer, Embedder } from "./botPipeline/types";
import type { MessageRepository, NewMessage, StoredMessage } from "./botPipeline/repository";
import { prisma } from "./prisma";
import { isCategory, type Category } from "./categories";

/**
 * Adaptador que ejecuta el MISMO pipeline que el bot (categorizar + resumir
 * + guardar) desde el dashboard. La lógica en sí (processMessage,
 * sanitizeContent, GroqCategorizer, OfflineCategorizer,
 * ResilientCategorizer) vive en ./botPipeline/ como copia sincronizada del
 * bot — ver botPipeline/README.md para el porqué no es un import directo.
 *
 * Lo único genuinamente propio del dashboard es lo de aquí abajo: su propio
 * cliente de Groq y su propio repositorio (su propio Prisma) — cada app
 * mantiene sus SDKs, tal como exige que cada una tenga su propio
 * node_modules y su propio despliegue en Vercel.
 */

const DEFAULT_MODEL = "openai/gpt-oss-120b";

function toCategory(value: string): Category {
  return isCategory(value) ? value : "otro";
}

function toStoredMessage(row: {
  id: string;
  tipo: string;
  contenido: string;
  categoria: string;
  resumen: string;
  hecho: boolean;
  fecha: Date;
}): StoredMessage {
  return { ...row, categoria: toCategory(row.categoria) };
}

/** Convierte un vector a la forma que pgvector acepta casteada (`::vector`). */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Repositorio propio del dashboard: mismas operaciones, con su propio Prisma. */
class DashboardMessageRepository implements MessageRepository {
  async save(record: NewMessage): Promise<StoredMessage> {
    // Insert tipado primero (siempre fiable) y luego, si hay embedding, un
    // UPDATE aparte para la columna Unsupported — igual que en
    // src/db/prismaRepository.ts del bot (mismo motivo: Prisma excluye los
    // tipos Unsupported del cliente tipado, así que solo se puede escribir
    // con SQL crudo, y separarlo evita que un fallo ahí tumbe el guardado).
    const row = await prisma.message.create({
      data: {
        tipo: record.tipo,
        contenido: record.contenido,
        categoria: record.categoria,
        resumen: record.resumen,
      },
    });

    if (record.embedding && record.embedding.length > 0) {
      try {
        await prisma.$executeRaw`UPDATE "messages" SET "embedding" = ${toVectorLiteral(record.embedding)}::vector WHERE "id" = ${row.id}`;
      } catch {
        // No crítico: el mensaje ya está guardado; backfill puede rellenarlo.
      }
    }

    return toStoredMessage(row);
  }

  async search(query: string, limit = 15): Promise<StoredMessage[]> {
    const needle = query.trim();
    if (needle === "") return [];
    const rows = await prisma.message.findMany({
      where: {
        OR: [
          { contenido: { contains: needle, mode: "insensitive" } },
          { resumen: { contains: needle, mode: "insensitive" } },
        ],
      },
      orderBy: { fecha: "desc" },
      take: Math.max(0, limit),
    });
    return rows.map(toStoredMessage);
  }

  async pending(limit = 50): Promise<StoredMessage[]> {
    const rows = await prisma.message.findMany({
      where: { hecho: false, categoria: { in: ["tarea", "recordatorio"] } },
      orderBy: { fecha: "desc" },
      take: Math.max(0, limit),
    });
    return rows.map(toStoredMessage);
  }

  async savedBetween(from: Date, to: Date): Promise<StoredMessage[]> {
    const rows = await prisma.message.findMany({
      where: { fecha: { gte: from, lt: to } },
      orderBy: { fecha: "desc" },
    });
    return rows.map(toStoredMessage);
  }
}

const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

/** Cae al categorizador offline si no hay GROQ_API_KEY, igual que hace el bot. */
function resolveCategorizer(): Categorizer {
  const offline = new OfflineCategorizer();
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return offline;

  const client = new Groq({ apiKey }) as unknown as GroqChatClient;
  const groq = new GroqCategorizer(client, process.env.GROQ_MODEL || DEFAULT_MODEL);
  return new ResilientCategorizer(groq, offline);
}

/**
 * Sin GEMINI_API_KEY, `NullEmbedder` hace que la captura siga guardando
 * mensajes con normalidad, solo que sin embedding (backfill posterior).
 * Exportada porque la búsqueda híbrida y el Asistente también la necesitan
 * para generar el vector de la consulta/pregunta.
 */
export function resolveEmbedder(): Embedder {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return new NullEmbedder();
  return new GeminiEmbedder(apiKey, { model: process.env.GEMINI_MODEL || DEFAULT_EMBEDDING_MODEL });
}

/**
 * Punto de entrada de la captura rápida: mismo pipeline que usa el bot
 * (sanea → categoriza → embebe → guarda), con el categorizador, embedder y
 * repositorio propios del dashboard inyectados.
 */
export async function captureMessage(contenido: string): Promise<StoredMessage> {
  return processMessage(
    { tipo: "text", contenido },
    {
      categorizer: resolveCategorizer(),
      embedder: resolveEmbedder(),
      repository: new DashboardMessageRepository(),
    },
  );
}
