import { describe, expect, it } from 'vitest';
import { noteActionsKeyboard, categoryPickerKeyboard } from '../src/telegram/actionsKeyboard.js';
import { CATEGORIES } from '../src/ai/types.js';

/** Aplana los botones del teclado a sus `callback_data`, para comprobar sin depender de la forma exacta de Telegraf. */
function callbackData(keyboard: ReturnType<typeof noteActionsKeyboard>): string[] {
  return keyboard.reply_markup.inline_keyboard
    .flat()
    .map((b) => (b as { callback_data: string }).callback_data);
}

describe('noteActionsKeyboard', () => {
  it('una tarea sin hacer lleva "Hecho" Y "Recategorizar"', () => {
    const data = callbackData(noteActionsKeyboard({ id: 'm1', categoria: 'tarea', hecho: false }));
    expect(data).toEqual(['done:m1', 'cat:m1']);
  });

  it('una tarea YA hecha no repite el botón de "Hecho" (invitaría a pulsarlo por error)', () => {
    const data = callbackData(noteActionsKeyboard({ id: 'm1', categoria: 'tarea', hecho: true }));
    expect(data).toEqual(['cat:m1']);
  });

  it('una nota (no accionable) nunca lleva "Hecho", aunque `hecho` fuera true por lo que sea', () => {
    const data = callbackData(noteActionsKeyboard({ id: 'm1', categoria: 'nota', hecho: false }));
    expect(data).toEqual(['cat:m1']);
  });
});

describe('categoryPickerKeyboard', () => {
  it('una fila por cada categoría posible, con el id de la nota en el callback', () => {
    const rows = categoryPickerKeyboard('m1').reply_markup.inline_keyboard;

    expect(rows).toHaveLength(CATEGORIES.length);
    const data = rows.flat().map((b) => (b as { callback_data: string }).callback_data);
    expect(data).toEqual(CATEGORIES.map((c) => `setcat:m1:${c}`));
  });

  it('el callback_data cabe de sobra en el límite de 64 bytes de Telegram, incluso con la categoría más larga', () => {
    const rows = categoryPickerKeyboard('c'.repeat(25)).reply_markup.inline_keyboard;
    for (const b of rows.flat()) {
      expect((b as { callback_data: string }).callback_data.length).toBeLessThanOrEqual(64);
    }
  });

  it('añade una fila por cada categoría PROPIA, con su propio prefijo de callback (setcustom, no setcat)', () => {
    const rows = categoryPickerKeyboard('m1', [
      { id: 'c1', nombre: 'Recetas', emoji: '🍳' },
      { id: 'c2', nombre: 'Viajes', emoji: null },
    ]).reply_markup.inline_keyboard;

    expect(rows).toHaveLength(CATEGORIES.length + 2);
    const ultimasDos = rows.slice(-2).flat();
    expect((ultimasDos[0] as { callback_data: string }).callback_data).toBe('setcustom:m1:c1');
    expect((ultimasDos[1] as { callback_data: string }).callback_data).toBe('setcustom:m1:c2');
    // Un emoji propio se respeta; sin emoji, cae a un 🏷️ genérico —
    // mismo criterio que formatResponseCard.
    expect((ultimasDos[0] as { text: string }).text).toBe('🍳 Recetas');
    expect((ultimasDos[1] as { text: string }).text).toBe('🏷️ Viajes');
  });

  it('el peor caso (setcustom + dos cuids de 25) sigue cabiendo en 64 bytes', () => {
    const rows = categoryPickerKeyboard('c'.repeat(25), [{ id: 'd'.repeat(25), nombre: 'X', emoji: null }])
      .reply_markup.inline_keyboard;
    for (const b of rows.flat()) {
      expect((b as { callback_data: string }).callback_data.length).toBeLessThanOrEqual(64);
    }
  });

  it('sin categorías propias, no añade ninguna fila de más', () => {
    const rows = categoryPickerKeyboard('m1').reply_markup.inline_keyboard;
    expect(rows).toHaveLength(CATEGORIES.length);
  });
});
