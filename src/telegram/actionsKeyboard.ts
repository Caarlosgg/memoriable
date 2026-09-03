import { Markup } from 'telegraf';
import { CATEGORIES, type Category } from '../ai/types.js';
import { isPending } from '../db/pending.js';
import type { StoredMessage } from '../db/repository.js';
import type { CustomCategory } from '../db/customCategories.js';

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
  const primera = [];
  if (isPending(message)) {
    primera.push(Markup.button.callback('✅ Hecho', `done:${message.id}`));
    // Aplazar solo tiene sentido en algo que todavía está pendiente: mover
    // la fecha de una idea, o de una tarea ya cerrada, no significa nada.
    primera.push(Markup.button.callback('⏰ Aplazar', `snooze:${message.id}`));
  }
  primera.push(Markup.button.callback('🏷️ Recategorizar', `cat:${message.id}`));
  // Borrar en su propia fila y con confirmación aparte (ver
  // confirmDeleteKeyboard): es la única acción irreversible del teclado, y
  // no puede quedar pegada a "Hecho" donde se pulsa por inercia.
  return Markup.inlineKeyboard([primera, [Markup.button.callback('🗑 Borrar', `del:${message.id}`)]]);
}

/**
 * Opciones de aplazamiento. Fechas relativas y no un calendario: desde el
 * móvil, "mañana" es lo que de verdad se quiere el 90% de las veces, y
 * elegir un día concreto ya se puede hacer en el dashboard.
 *
 * "Quitar fecha" está porque aplazar indefinidamente es una opción legítima
 * — sin ella, la única salida de una tarea con fecha sería darla por hecha
 * o borrarla, y ninguna de las dos es verdad.
 */
export function snoozePickerKeyboard(messageId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Hoy', `snz:${messageId}:0`),
      Markup.button.callback('Mañana', `snz:${messageId}:1`),
    ],
    [
      Markup.button.callback('En 3 días', `snz:${messageId}:3`),
      Markup.button.callback('En una semana', `snz:${messageId}:7`),
    ],
    [Markup.button.callback('Quitar fecha', `snz:${messageId}:x`)],
  ]);
}

/**
 * Confirmación de borrado. Un paso extra a propósito: es la única acción del
 * teclado que no se puede deshacer, y en Telegram no hay "deshacer" como en
 * el dashboard (ver UndoToast) — el botón de cancelar va primero para que el
 * pulgar no caiga por inercia sobre el destructivo.
 */
export function confirmDeleteKeyboard(messageId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Cancelar', `delno:${messageId}`),
      Markup.button.callback('🗑 Sí, borrar', `delsi:${messageId}`),
    ],
  ]);
}

/**
 * Selector de categoría: una fila por botón (6 fijas + las propias del
 * usuario, se lee mejor apiladas que en una cuadrícula estrecha).
 * Deliberadamente sin marcar cuál es la actual ni un botón de "cancelar":
 * eso exigiría una consulta aparte solo para pintar el selector, y el
 * mismo resultado (deshacer un cambio) ya se consigue pulsando
 * "Recategorizar" otra vez sobre la tarjeta actualizada — más simple, sin
 * dato extra que mantener sincronizado.
 *
 * Dos prefijos de `callback_data` distintos (`setcat:`/`setcustom:`), no
 * uno solo: una categoría FIJA cambia `categoria` (recategorize); una
 * PROPIA pone `customCategoryId` APARTE, sin tocar `categoria` (ver el
 * comentario de `Message.customCategoryId` en schema.prisma) — son dos
 * columnas y dos operaciones distintas, así que van por rutas distintas
 * desde el principio, sin ambigüedad que parsear en el handler.
 *
 * Con un cuid de 25 caracteres cada uno, el caso más largo
 * (`setcustom:<25>:<25>`) son 61 bytes — de sobra bajo el límite de 64 de
 * Telegram.
 */
/**
 * Selector de espacio de trabajo para `/espacio`.
 *
 * El actual lleva "•" delante en vez de estar ausente o deshabilitado: la
 * pregunta de quien abre esto es "¿dónde estoy escribiendo AHORA?" tanto
 * como "¿dónde quiero escribir?", y quitar el botón activo dejaría la
 * primera sin responder. Pulsarlo simplemente reconfirma, que es inofensivo.
 *
 * `callback_data` = `ws:<cuid>` → 28 bytes, muy por debajo del límite de 64
 * de Telegram.
 */
export function workspacePickerKeyboard(
  espacios: readonly { id: string; nombre: string; personal: boolean }[],
  actualId: string,
) {
  return Markup.inlineKeyboard(
    espacios.map((w) => [
      Markup.button.callback(
        `${w.id === actualId ? '• ' : ''}${w.personal ? '🔒' : '🏢'} ${w.nombre}`,
        `ws:${w.id}`,
      ),
    ]),
  );
}

export function categoryPickerKeyboard(messageId: string, customCategories: readonly CustomCategory[] = []) {
  const fijas = CATEGORIES.map((categoria) => [
    Markup.button.callback(CATEGORY_BUTTON_LABEL[categoria], `setcat:${messageId}:${categoria}`),
  ]);
  const propias = customCategories.map((c) => [
    Markup.button.callback(`${c.emoji ? `${c.emoji} ` : '🏷️ '}${c.nombre}`, `setcustom:${messageId}:${c.id}`),
  ]);
  return Markup.inlineKeyboard([...fijas, ...propias]);
}
