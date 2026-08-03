import "server-only";
import type { Message } from "@prisma/client";
import { prisma } from "./prisma";
import type { Category } from "./categories";

/** Convierte un vector a la forma que pgvector acepta casteada (`::vector`). */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Busca los mensajes más similares (distancia coseno) a un vector ya
 * calculado. `embedding` es `Unsupported("vector(768)")` en el schema —
 * Prisma lo excluye del cliente tipado, así que esto va por $queryRaw. La
 * columna se selecciona explícitamente (nunca `SELECT *`) para que la forma
 * coincida con `Message` y no arrastre el vector completo de vuelta.
 */
export async function findSimilarMessages(
  queryEmbedding: number[],
  options: { categoria?: Category | null; limit?: number } = {},
): Promise<Message[]> {
  const limit = Math.max(0, options.limit ?? 5);
  const categoria = options.categoria ?? null;
  const literal = toVectorLiteral(queryEmbedding);

  return prisma.$queryRaw<Message[]>`
    SELECT "id", "tipo", "contenido", "categoria", "resumen", "hecho", "fecha"
    FROM "messages"
    WHERE "embedding" IS NOT NULL
      AND (${categoria}::text IS NULL OR "categoria" = ${categoria})
    ORDER BY "embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `;
}
