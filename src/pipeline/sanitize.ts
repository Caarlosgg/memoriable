/**
 * Validación y saneado del contenido entrante.
 *
 * Objetivo: que ningún mensaje raro (vacío, gigantesco, con caracteres de
 * control o surrogates sueltos) pueda tirar el pipeline, corromper lo que se
 * guarda en base de datos, ni disparar el coste de la API.
 */

/**
 * Límite de caracteres que se envía a la IA y se persiste.
 * 4000 ≈ el máximo de un mensaje de Telegram (4096) y acota el coste por
 * llamada: un mensaje enorme no puede convertirse en una factura enorme.
 */
export const MAX_CONTENT_LENGTH = 4000;

export type InvalidMessageReason = 'not_text' | 'empty';

/** Contenido que no puede procesarse (se rechaza pronto y con motivo claro). */
export class InvalidMessageError extends Error {
  readonly reason: InvalidMessageReason;

  constructor(reason: InvalidMessageReason, message: string) {
    super(message);
    this.name = 'InvalidMessageError';
    this.reason = reason;
  }
}

export interface SanitizeResult {
  /** Contenido ya saneado y listo para usar. */
  contenido: string;
  /** `true` si hubo que recortar por exceder el límite. */
  truncated: boolean;
  /** Longitud original (antes de sanear), útil para logs. */
  originalLength: number;
  /** Longitud final. */
  length: number;
}

/**
 * Caracteres "invisibles o peligrosos": todo lo de categoría Unicode C
 * (control, formato, surrogates sueltos, no asignados) EXCEPTO el salto de
 * línea y el tabulador, que sí queremos conservar.
 *
 * Con la bandera `u` los pares surrogate válidos (emoji) se tratan como un
 * único code point y no se ven afectados; solo caen los surrogates sueltos,
 * que son los que rompen la serialización JSON y la escritura en Postgres.
 */
const UNSAFE_CHARS = /[^\P{C}\n\t]/gu;

/**
 * Sanea un contenido arbitrario. Lanza `InvalidMessageError` si no es texto o
 * si queda vacío tras limpiarlo.
 */
export function sanitizeContent(
  raw: unknown,
  maxLength: number = MAX_CONTENT_LENGTH,
): SanitizeResult {
  if (typeof raw !== 'string') {
    throw new InvalidMessageError('not_text', 'El contenido del mensaje no es texto.');
  }

  const originalLength = raw.length;

  let text = raw.normalize('NFC');
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(UNSAFE_CHARS, '');
  // Colapsa espacios/tabuladores repetidos y limita los saltos consecutivos.
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  if (text.length === 0) {
    throw new InvalidMessageError('empty', 'El mensaje está vacío tras sanearlo.');
  }

  let truncated = false;
  if (text.length > maxLength) {
    text = cutAt(text, maxLength - 1) + '…';
    truncated = true;
  }

  return { contenido: text, truncated, originalLength, length: text.length };
}

/** Corta en `limit` sin partir un par surrogate (emoji) por la mitad. */
function cutAt(text: string, limit: number): string {
  const slice = text.slice(0, limit);
  const lastCode = slice.charCodeAt(slice.length - 1);
  const cortaParSurrogate = lastCode >= 0xd800 && lastCode <= 0xdbff;
  return cortaParSurrogate ? slice.slice(0, -1) : slice;
}
