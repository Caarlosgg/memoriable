// Copia sincronizada de ../../../../src/ai/types.ts — ver README de esta
// carpeta (botPipeline/README.md) para el porqué de la copia.

/** Categorías posibles para un mensaje entrante. */
export const CATEGORIES = [
  'tarea',
  'idea',
  'pregunta',
  'recordatorio',
  'nota',
  'otro',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Comprueba (y estrecha el tipo de) una categoría arbitraria. */
export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/** Mensaje entrante, independiente de Telegram. */
export interface IncomingMessage {
  /** Tipo de mensaje, p.ej. "text". */
  tipo: string;
  /** Contenido textual del mensaje. */
  contenido: string;
}

/** Resultado del análisis por IA. Ver ../../../../src/ai/types.ts (copia sincronizada). */
export interface Analysis {
  categoria: Category;
  resumen: string;
  confianza?: number;
  preguntaAclaratoria?: string;
}

/**
 * Contrato de categorización/resumen. La lógica de negocio depende de esta
 * interfaz, no de la SDK de Groq, para poder inyectar mocks en tests.
 */
export interface Categorizer {
  analyze(message: IncomingMessage): Promise<Analysis>;
}

/**
 * Contrato de generación de embeddings para búsqueda semántica. Nunca
 * lanza: `null` significa "no se pudo generar".
 */
export interface Embedder {
  embedDocument(text: string): Promise<number[] | null>;
  embedQuery(text: string): Promise<number[] | null>;
}
