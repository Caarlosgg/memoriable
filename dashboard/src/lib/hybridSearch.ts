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
  /** Etiqueta libre (Fase F/J): coincidencia exacta contra `Message.etiquetas`. */
  etiqueta?: string | null;
}

/**
 * Constante de amortiguación de la Reciprocal Rank Fusion.
 *
 * El artículo original (Cormack et al.) usa 60, pensado para fusionar
 * decenas de motores sobre listas larguísimas. Aquí son dos listas de como
 * mucho 15: con k=60 la diferencia entre el puesto 1 y el 15 es de un 20%,
 * así que el PESO de cada lista decidía absolutamente todo y lo semántico
 * nunca podía adelantar a nada de texto — es decir, el mismo comportamiento
 * que se quería arreglar, con más matemáticas encima. Con k=10 el puesto
 * vuelve a significar algo.
 */
const RRF_K = 10;

/**
 * Cuánto pesa cada mitad.
 *
 * El texto pesa más porque una coincidencia literal es una CERTEZA y una
 * semántica es una conjetura. Con estos números y `RRF_K`, la política
 * resultante es: el 1º por significado adelanta a un texto a partir del
 * puesto ~7, pero nunca a los primeros. Que es lo que se quiere — una nota
 * donde la palabra sale de refilón no debe ganar a la que trata del tema,
 * ni al revés.
 */
const PESO_TEXTO = 1.5;
const PESO_SEMANTICO = 1;

/**
 * Fusiona las dos listas por RELEVANCIA (Reciprocal Rank Fusion), no
 * concatenándolas.
 *
 * Antes era "el texto primero, y lo semántico rellena los huecos que
 * queden". Eso tenía dos consecuencias malas y la segunda era grave:
 *
 * 1. Si 15 notas contenían la palabra literal, la búsqueda semántica **no
 *    se ejecutaba nunca** — justo el caso donde más falta hace, porque con
 *    tantas coincidencias literales lo que sobra es ruido y lo que hace
 *    falta es ordenar por sentido.
 * 2. Una nota que aparecía en LAS DOS listas no ganaba nada por ello,
 *    cuando es precisamente la señal más fuerte que existe: coincide
 *    literalmente Y por significado.
 *
 * RRF resuelve las dos: cada documento suma 1/(k + puesto) por cada lista
 * en la que aparece, así que estar en ambas suma dos veces.
 *
 * Función pura — sin I/O — para poder probar la política de mezcla sin
 * tocar la base de datos.
 */
export function mergeHybridResults(
  textResults: Message[],
  semanticResults: Message[],
  limit: number,
): Message[] {
  const puntos = new Map<string, { message: Message; score: number }>();

  const acumular = (lista: Message[], peso: number) => {
    lista.forEach((message, i) => {
      const previo = puntos.get(message.id);
      const score = (previo?.score ?? 0) + peso / (RRF_K + i + 1);
      // Se conserva el objeto de la PRIMERA lista donde apareció: las dos
      // traen la misma fila, pero el de texto viene del cliente tipado de
      // Prisma y el semántico de un $queryRaw — mejor no mezclar formas.
      puntos.set(message.id, { message: previo?.message ?? message, score });
    });
  };

  acumular(textResults, PESO_TEXTO);
  acumular(semanticResults, PESO_SEMANTICO);

  return [...puntos.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((p) => p.message);
}

export interface HybridSearchDeps {
  /** Búsqueda de texto ya existente (ILIKE), inyectada para poder testear. */
  textSearch: (query: string, filters: SearchFilters, limit: number) => Promise<Message[]>;
  embedder: Embedder;
  /** Búsqueda semántica ya existente, inyectada para poder testear (y para que el dueño quede ligado antes de llegar aquí). */
  findSimilar: (queryEmbedding: number[], options: SearchFilters & { limit?: number }) => Promise<Message[]>;
}

/**
 * Orquesta la búsqueda híbrida: las DOS mitades se ejecutan siempre y en
 * paralelo, y el resultado se fusiona por relevancia (ver
 * `mergeHybridResults`).
 *
 * Que se ejecuten siempre es el cambio importante: antes la semántica se
 * saltaba en cuanto el texto llenaba la página, que es justo cuando más
 * falta hace ordenar por sentido. Cuesta una llamada de embedding por
 * búsqueda — asumible, porque una búsqueda la lanza una persona a mano, no
 * un bucle.
 *
 * Sin GEMINI_API_KEY (o si Gemini falla), `embedder.embedQuery` devuelve
 * `null` y la búsqueda se queda solo con texto — nunca rompe por esto.
 */
export async function hybridSearch(
  query: string,
  filters: SearchFilters,
  limit: number,
  deps: HybridSearchDeps,
): Promise<Message[]> {
  const needle = query.trim();
  if (needle === "") return [];

  // En paralelo: no dependen entre sí, y hacerlas en serie sumaba la
  // latencia de Gemini a la de Postgres en cada búsqueda.
  const [textResults, queryEmbedding] = await Promise.all([
    deps.textSearch(needle, filters, limit),
    deps.embedder.embedQuery(needle).catch(() => null),
  ]);

  if (!queryEmbedding) return textResults.slice(0, Math.max(0, limit));

  // Se piden `limit` completos (no "los que falten"): con RRF, un resultado
  // semántico puede adelantar a uno de texto, así que hace falta la lista
  // entera para poder ordenarlas juntas.
  const semanticResults = await deps
    .findSimilar(queryEmbedding, { ...filters, limit })
    .catch(() => [] as Message[]);

  return mergeHybridResults(textResults, semanticResults, limit);
}
