import { describe, expect, it } from 'vitest';
import { formatMessageList } from '../src/telegram/formatList.js';
import type { StoredMessage } from '../src/db/repository.js';

const base: StoredMessage = {
  id: 'x',
  tipo: 'text',
  contenido: 'contenido',
  categoria: 'tarea',
  resumen: 'Comprar pan',
  fecha: new Date('2026-01-05T10:00:00.000Z'),
};

describe('formatMessageList', () => {
  it('devuelve el texto de vacío cuando no hay mensajes', () => {
    expect(formatMessageList([], { header: 'H', empty: 'nada por aquí' })).toBe('nada por aquí');
  });

  it('incluye el encabezado y una tarjeta por mensaje', () => {
    const out = formatMessageList([base, { ...base, id: 'y', resumen: 'Llamar al banco' }], {
      header: '🔎 Resultados:',
      empty: 'vacío',
    });
    expect(out.startsWith('🔎 Resultados:')).toBe(true);
    expect(out).toContain('Comprar pan');
    expect(out).toContain('Llamar al banco');
    expect(out).toContain('<b>Tarea</b>');
  });
});
