import "server-only";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import type { Embedder } from "./botPipeline/types";
import type { Category } from "./categories";

/**
 * Filtros del buscador (Fase F): además del texto y la categoría (ya
 * existían), estado/prioridad/rango de fechas. Todos opcionales — sin
 * ninguno, el comportamiento es el de siempre.
 */
export interface SearchFilters {
  categoria?: Category | null;
  estado?: EstadoTarea | null;
  prioridad?: Prioridad | null;
  /** Inclusive: solo mensajes desde esta fecha. */
  desde?: Date | null;
  /** Inclusive: solo mensajes hasta esta fecha. */
  hasta?: Date | null;
}

/**
 * Combina resultados de texto (exacto, ya probado) con resultados
 * semánticos (complemento): el texto SIEMPRE va primero y en su propio
 * orden; lo semántico solo rellena huecos hasta `limit`, sin duplicar ids
 * ni desplazar coincidencias de texto. Función pura — sin I/O — para poder
 * probar la política de mezcla sin tocar la base de datos.
 */
export function mergeHybridResults(
  textResults: Message[],
  semanticResults: Message[],
  limit: number,
): Message[] {
  const seen = new Set(textResults.map((m) => m.id));
  const complement = semanticResults.filter((m) => !seen.has(m.id));
  return [...textResults, ...complement].slice(0, Math.max(0, limit));
}

export interface HybridSearchDeps {
  /** Búsqueda de texto ya existente (ILIKE), inyectada para poder testear. */
  textSearch: (query: string, filters: SearchFilters, limit: number) => Promise<Message[]>;
  embedder: Embedder;
  /** Búsqueda semántica ya existente, inyectada para poder testear (y para que el dueño quede ligado antes de llegar aquí). */
  findSimilar: (queryEmbedding: number[], options: SearchFilters & { limit?: number }) => Promise<Message[]>;
}

/**
 * Orquesta la búsqueda híbrida: texto primero; si no llena el límite, se
 * completa con similitud semántica (si hay embedder disponible). Sin
 * GEMINI_API_KEY (o si Gemini falla), `embedder.embedQuery` devuelve `null`
 * y la búsqueda se queda solo con texto — nunca rompe por esto.
 */
export async function hybridSearch(
  query: string,
  filters: SearchFilters,
  limit: number,
  deps: HybridSearchDeps,
): Promise<Message[]> {
  const needle = query.trim();
  if (needle === "") return [];

  const textResults = await deps.textSearch(needle, filters, limit);
  if (textResults.length >= limit) return textResults;

  const queryEmbedding = await deps.embedder.embedQuery(needle);
  if (!queryEmbedding) return textResults;

  const remaining = limit - textResults.length;
  // Se piden algunos de más (remaining, no remaining+ya-vistos) porque
  // deduplicar es barato y pedir "encuentra N que no sean estos ids" por
  // SQL añade complejidad de parametrización de arrays que no compensa aquí.
  const semanticResults = await deps.findSimilar(queryEmbedding, { ...filters, limit: remaining });

  return mergeHybridResults(textResults, semanticResults, limit);
}
