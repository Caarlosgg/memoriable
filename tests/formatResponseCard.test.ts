import { describe, expect, it } from 'vitest';
import { formatResponseCard } from '../src/telegram/formatResponseCard.js';

const fecha = new Date('2026-07-28T05:42:00.000Z');

describe('formatResponseCard', () => {
  it('formatea una tarjeta con emoji, negrita y fecha legible', () => {
    const card = formatResponseCard({ categoria: 'idea', resumen: 'Montar una cafetería', fecha });

    // 07:42 y no 05:42: la fecha va en BOT_TIMEZONE (Europe/Madrid por
    // defecto, CEST en julio), no en UTC. Enseñar UTC pintaba cada nota una
    // o dos horas antes de cuando el usuario la escribió.
    expect(card).toBe('💡 <b>Idea</b>\nMontar una cafetería\n🕒 28/07/2026, 07:42');
  });

  it('usa un emoji y etiqueta propios por cada categoría', () => {
    const casos: Array<[string, string]> = [
      ['tarea', '✅'],
      ['idea', '💡'],
      ['pregunta', '❓'],
      ['recordatorio', '⏰'],
      ['nota', '📝'],
    ];

    for (const [categoria, emoji] of casos) {
      const card = formatResponseCard({ categoria: categoria as never, resumen: 'x', fecha });
      expect(card.startsWith(emoji)).toBe(true);
    }
  });

  it('la categoría "otro" se muestra como "Sin categorizar", no con una etiqueta rara', () => {
    const card = formatResponseCard({ categoria: 'otro', resumen: 'contenido ambiguo', fecha });
    expect(card).toContain('<b>Sin categorizar</b>');
  });

  it('escapa HTML del resumen para no romper el parse_mode de Telegram', () => {
    const card = formatResponseCard({ categoria: 'nota', resumen: '<script>alert(1)</script> & cia', fecha });
    expect(card).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; cia');
    expect(card).not.toContain('<script>');
  });

  it('usa un texto de reserva si el resumen queda vacío tras limpiar espacios', () => {
    const card = formatResponseCard({ categoria: 'nota', resumen: '   ', fecha });
    expect(card).toContain('(sin resumen)');
  });

  it('degrada a la presentación de "otro" ante una categoría desconocida en tiempo de ejecución', () => {
    const card = formatResponseCard({ categoria: 'inventada' as never, resumen: 'x', fecha });
    expect(card).toContain('<b>Sin categorizar</b>');
  });

  it('no lanza y usa un texto de reserva si la fecha es inválida', () => {
    const card = formatResponseCard({ categoria: 'nota', resumen: 'x', fecha: new Date('esto-no-es-una-fecha') });
    expect(card).toContain('🕒 fecha desconocida');
  });

  it('con una categoría propia, añade una línea aparte sin tocar la cabecera fija', () => {
    const card = formatResponseCard({
      categoria: 'nota',
      resumen: 'x',
      fecha,
      categoriaPersonalizada: { nombre: 'Recetas', emoji: '🍳' },
    });

    // La cabecera sigue siendo la categoría FIJA — la propia es aditiva.
    expect(card).toContain('<b>Nota</b>');
    expect(card).toContain('🍳 Recetas');
  });

  it('una categoría propia sin emoji cae a un 🏷️ genérico', () => {
    const card = formatResponseCard({
      categoria: 'nota',
      resumen: 'x',
      fecha,
      categoriaPersonalizada: { nombre: 'Recetas', emoji: null },
    });

    expect(card).toContain('🏷️ Recetas');
  });

  it('escapa HTML del nombre de la categoría propia (no es contenido nuestro)', () => {
    const card = formatResponseCard({
      categoria: 'nota',
      resumen: 'x',
      fecha,
      categoriaPersonalizada: { nombre: '<b>hola</b>', emoji: null },
    });

    expect(card).toContain('&lt;b&gt;hola&lt;/b&gt;');
  });

  it('sin categoría propia, no añade ninguna línea de más', () => {
    const card = formatResponseCard({ categoria: 'nota', resumen: 'x', fecha });
    expect(card.split('\n')).toHaveLength(3);
  });
});
