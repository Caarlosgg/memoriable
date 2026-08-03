import type { Analysis, Category } from '../ai/types.js';

/** Presentación (emoji + etiqueta) de cada categoría en la tarjeta de Telegram. */
const CATEGORY_PRESENTATION: Record<Category, { emoji: string; label: string }> = {
  tarea: { emoji: '✅', label: 'Tarea' },
  idea: { emoji: '💡', label: 'Idea' },
  pregunta: { emoji: '❓', label: 'Pregunta' },
  recordatorio: { emoji: '⏰', label: 'Recordatorio' },
  nota: { emoji: '📝', label: 'Nota' },
  // "otro" es la categoría de reserva (sin match claro): se muestra sin forzar
  // una etiqueta rara, tal cual pide el producto.
  otro: { emoji: '🗂️', label: 'Sin categorizar' },
};

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** Escapa los caracteres especiales de Telegram HTML (contenido no controlado por nosotros). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ResponseCardData extends Analysis {
  fecha: Date;
}

/**
 * Formatea el resultado de un mensaje procesado como una tarjeta en HTML de
 * Telegram (`parse_mode: 'HTML'`): categoría en negrita con emoji temático,
 * resumen debajo y fecha legible. Punto único de presentación para no repetir
 * este formato en cada handler.
 */
/** Nunca lanza: una fecha corrupta no debe tumbar la respuesta al usuario. */
function formatFecha(fecha: Date): string {
  if (Number.isNaN(fecha.getTime())) return 'fecha desconocida';
  return DATE_FORMATTER.format(fecha);
}

export function formatResponseCard({ categoria, resumen, fecha }: ResponseCardData): string {
  const { emoji, label } = CATEGORY_PRESENTATION[categoria] ?? CATEGORY_PRESENTATION.otro;
  const resumenLimpio = escapeHtml(resumen.trim()) || '(sin resumen)';

  return [`${emoji} <b>${label}</b>`, resumenLimpio, `🕒 ${formatFecha(fecha)}`].join('\n');
}
