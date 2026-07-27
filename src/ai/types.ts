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

/** Resultado del análisis por IA. */
export interface Analysis {
  categoria: Category;
  resumen: string;
}

/**
 * Contrato de categorización/resumen. La lógica de negocio depende de esta
 * interfaz, no de la SDK de Anthropic, para poder inyectar mocks en tests.
 */
export interface Categorizer {
  analyze(message: IncomingMessage): Promise<Analysis>;
}
