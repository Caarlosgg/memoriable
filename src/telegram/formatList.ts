import type { StoredMessage } from '../db/repository.js';
import { formatResponseCard } from './formatResponseCard.js';

/** Separador visual entre tarjetas de una lista. */
const CARD_SEPARATOR = '\n\n➖➖➖\n\n';

/**
 * Formatea una lista de mensajes como varias tarjetas (mismo formato que la
 * respuesta a un mensaje entrante) bajo un encabezado, o un texto amable si la
 * lista está vacía. Punto único de presentación para `/buscar` y `/pendientes`.
 */
export function formatMessageList(
  messages: readonly StoredMessage[],
  { header, empty }: { header: string; empty: string },
): string {
  if (messages.length === 0) return empty;
  const cards = messages.map((m) => formatResponseCard(m)).join(CARD_SEPARATOR);
  return `${header}\n\n${cards}`;
}
