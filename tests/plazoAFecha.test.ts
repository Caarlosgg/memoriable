import { describe, expect, it } from 'vitest';
import { plazoAFecha } from '../src/telegram/bot.js';

const ahora = new Date('2026-09-03T10:30:00.000Z');

describe('plazoAFecha', () => {
  it('"0" es hoy, al final del día: una tarea para hoy no vence a las 00:00', () => {
    const fecha = plazoAFecha('0', ahora)!;
    expect(fecha.getDate()).toBe(ahora.getDate());
    expect(fecha.getHours()).toBe(23);
    expect(fecha.getMinutes()).toBe(59);
  });

  it('"1" es mañana', () => {
    const fecha = plazoAFecha('1', ahora)!;
    expect(fecha.getDate()).toBe(new Date('2026-09-04T00:00:00').getDate());
  });

  it('"7" salta de mes correctamente', () => {
    const fecha = plazoAFecha('30', new Date('2026-09-20T10:00:00'))!;
    expect(fecha.getMonth()).toBe(9); // octubre
  });

  it('"x" quita la fecha — null, que NO es lo mismo que un plazo inválido', () => {
    // Aplazar indefinidamente es una opción legítima: confundirla con un
    // error dejaría al usuario sin salida de una tarea con fecha salvo
    // darla por hecha o borrarla.
    expect(plazoAFecha('x', ahora)).toBeNull();
  });

  it('un plazo que no es un número devuelve undefined, no null', () => {
    expect(plazoAFecha('mañana', ahora)).toBeUndefined();
    expect(plazoAFecha('', ahora)).toBeUndefined();
  });

  it('rechaza plazos negativos o absurdos (el callback_data es entrada de usuario)', () => {
    expect(plazoAFecha('-1', ahora)).toBeUndefined();
    expect(plazoAFecha('99999', ahora)).toBeUndefined();
    expect(plazoAFecha('1.5', ahora)).toBeUndefined();
  });
});
