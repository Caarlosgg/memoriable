import type { StoredMessage } from './repository.js';

/** Límite por defecto de resultados devueltos por una búsqueda. */
export const DEFAULT_SEARCH_LIMIT = 10;

/**
 * ¿Coincide el mensaje con la consulta? Búsqueda simple, sin acentos-fold ni
 * embeddings: coincidencia de subcadena (case-insensitive) sobre el contenido
 * original y el resumen. Es el equivalente en memoria del `ILIKE '%q%'` que usa
 * Postgres, extraído aquí para poder testearlo sin base de datos.
 */
export function matchesQuery(message: Pick<StoredMessage, 'contenido' | 'resumen'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return false;
  return (
    message.contenido.toLowerCase().includes(needle) ||
    message.resumen.toLowerCase().includes(needle)
  );
}

/**
 * Filtra y ordena mensajes por coincidencia de texto, más recientes primero.
 * Lógica de negocio pura (sin I/O): la usa el repositorio en memoria y sirve de
 * referencia del comportamiento esperado del repositorio de Prisma.
 */
export function searchMessages(
  messages: readonly StoredMessage[],
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): StoredMessage[] {
  if (query.trim() === '') return [];
  return messages
    .filter((m) => matchesQuery(m, query))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .slice(0, Math.max(0, limit));
}
