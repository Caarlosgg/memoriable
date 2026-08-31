import { Markup } from 'telegraf';
import { CATEGORIES, type Category } from '../ai/types.js';
import { isPending } from '../db/pending.js';
import type { StoredMessage } from '../db/repository.js';

/** Presentación (emoji + etiqueta) de cada categoría — mismo criterio visual que formatResponseCard.ts. */
const CATEGORY_BUTTON_LABEL: Record<Category, string> = {
  tarea: '✅ Tarea',
  idea: '💡 Idea',
  pregunta: '❓ Pregunta',
  recordatorio: '⏰ Recordatorio',
  nota: '📝 Nota',
  otro: '🗂️ Sin categorizar',
};

/**
 * Botones bajo la tarjeta de confirmación (Fase 3 del roadmap: "reduce
 * fricción de uso diario" — antes había que abrir el dashboard para
 * marcar hecho o corregir una categoría mal puesta).
 *
 * "✅ Hecho" solo aparece si la nota es accionable (tarea/recordatorio) y
 * todavía no está hecha — en el resto de categorías no significa nada
 * (¿"hecho" de una idea?), y repetir el botón en una tarea ya cerrada
 * invitaría a pulsarlo por error.
 */
export function noteActionsKeyboard(message: Pick<StoredMessage, 'id' | 'categoria' | 'hecho'>) {
  const buttons = [];
  if (isPending(message)) {
    buttons.push(Markup.button.callback('✅ Hecho', `done:${message.id}`));
  }
  buttons.push(Markup.button.callback('🏷️ Recategorizar', `cat:${message.id}`));
  return Markup.inlineKeyboard(buttons);
}

/**
 * Selector de categoría: una fila por botón (6 categorías, se lee mejor
 * apiladas que en una cuadrícula estrecha). Deliberadamente sin marcar cuál
 * es la actual ni un botón de "cancelar": eso exigiría una consulta aparte
 * solo para pintar el selector, y el mismo resultado (deshacer un cambio)
 * ya se consigue pulsando "Recategorizar" otra vez sobre la tarjeta
 * actualizada — más simple, sin dato extra que mantener sincronizado.
 *
 * `callback_data` lleva id + categoría (`setcat:<id>:<categoria>`): con un
 * cuid de 25 caracteres y la categoría más larga ("recordatorio"), son ~45
 * bytes — de sobra bajo el límite de 64 de Telegram.
 */
export function categoryPickerKeyboard(messageId: string) {
  return Markup.inlineKeyboard(
    CATEGORIES.map((categoria) => [
      Markup.button.callback(CATEGORY_BUTTON_LABEL[categoria], `setcat:${messageId}:${categoria}`),
    ]),
  );
}
