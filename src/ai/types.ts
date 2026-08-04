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
  /**
   * Qué tan segura está la IA de la categoría elegida (0-1). Opcional: solo
   * lo rellena el categorizador real (Groq) — el offline no tiene forma de
   * medirlo, así que lo omite (se trata como confianza alta por defecto).
   * No se persiste en BD (no hay columna para esto en Message): es una
   * señal transitoria para que el bot decida si hace falta preguntar algo
   * más, no un dato de negocio.
   */
  confianza?: number;
  /**
   * Si la IA cree que falta un dato importante para que la nota tenga
   * sentido del todo (p. ej. un recordatorio sin fecha), una pregunta
   * corta para pedirlo — el bot la manda como aviso aparte, DESPUÉS de
   * guardar (nunca bloquea el guardado: perder el mensaje del usuario
   * porque nunca contestó a la aclaración sería peor que guardarlo con la
   * mejor categoría posible y preguntar por si acaso).
   */
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
 * Contrato de generación de embeddings para búsqueda semántica. Nunca lanza:
 * `null` significa "no se pudo generar" (sin API key, fallo de red, etc.),
 * y el pipeline sigue guardando el mensaje igual, sin bloquear por esto.
 *
 * Dos métodos en vez de uno con un parámetro de modo: la API de Gemini
 * distingue "documento a indexar" de "consulta de búsqueda" (`taskType`) y
 * da mejor recall si cada lado usa el suyo — nombrarlos explícitamente evita
 * que una llamada use el modo equivocado por accidente.
 */
export interface Embedder {
  embedDocument(text: string): Promise<number[] | null>;
  embedQuery(text: string): Promise<number[] | null>;
}
