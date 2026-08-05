import "server-only";
import type { Message } from "@prisma/client";
import { prisma } from "./prisma";
import type { SearchFilters } from "./hybridSearch";

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
 *
 * Selecciona también `estado`/`prioridad`/`userId` (antes no iban, aunque
 * `Message` los tiene): `MessageDetailDialog` (Fase B) los necesita para
 * mostrar/editar una nota citada por búsqueda semántica — sin ellos, abrir
 * el modal sobre un resultado semántico rompía al leer un estado/prioridad
 * `undefined`.
 */
export async function findSimilarMessages(
  userId: string,
  queryEmbedding: number[],
  options: SearchFilters & { limit?: number } = {},
): Promise<Message[]> {
  const limit = Math.max(0, options.limit ?? 5);
  const categoria = options.categoria ?? null;
  const estado = options.estado ?? null;
  const prioridad = options.prioridad ?? null;
  const desde = options.desde ?? null;
  const hasta = options.hasta ?? null;
  const literal = toVectorLiteral(queryEmbedding);

  return prisma.$queryRaw<Message[]>`
    SELECT "id", "tipo", "contenido", "categoria", "resumen", "hecho", "estado", "prioridad", "fecha", "userId"
    FROM "messages"
    WHERE "embedding" IS NOT NULL
      AND "userId" = ${userId}
      AND (${categoria}::text IS NULL OR "categoria" = ${categoria})
      AND (${estado}::"EstadoTarea" IS NULL OR "estado" = ${estado}::"EstadoTarea")
      AND (${prioridad}::"Prioridad" IS NULL OR "prioridad" = ${prioridad}::"Prioridad")
      AND (${desde}::timestamptz IS NULL OR "fecha" >= ${desde}::timestamptz)
      AND (${hasta}::timestamptz IS NULL OR "fecha" <= ${hasta}::timestamptz)
    ORDER BY "embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `;
}
