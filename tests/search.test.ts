import { describe, expect, it } from 'vitest';
import { matchesQuery, searchMessages } from '../src/db/search.js';
import { InMemoryMessageRepository, type StoredMessage } from '../src/db/repository.js';

function msg(overrides: Partial<StoredMessage> & { id: string }): StoredMessage {
  return {
    tipo: 'text',
    contenido: '',
    categoria: 'nota',
    resumen: '',
    fecha: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('matchesQuery', () => {
  it('coincide en el contenido sin distinguir mayúsculas', () => {
    expect(matchesQuery({ contenido: 'Comprar LECHE', resumen: '' }, 'leche')).toBe(true);
  });

  it('coincide en el resumen aunque no esté en el contenido', () => {
    expect(matchesQuery({ contenido: 'xyz', resumen: 'recordatorio del médico' }, 'médico')).toBe(
      true,
    );
  });

  it('no coincide si el texto no aparece', () => {
    expect(matchesQuery({ contenido: 'hola mundo', resumen: 'saludo' }, 'factura')).toBe(false);
  });

  it('una consulta vacía o en blanco nunca coincide', () => {
    expect(matchesQuery({ contenido: 'algo', resumen: 'algo' }, '')).toBe(false);
    expect(matchesQuery({ contenido: 'algo', resumen: 'algo' }, '   ')).toBe(false);
  });
});

describe('searchMessages', () => {
  const messages: StoredMessage[] = [
    msg({ id: 'a', contenido: 'Pagar la factura de la luz', fecha: new Date('2026-01-01') }),
    msg({ id: 'b', resumen: 'Factura del agua pendiente', fecha: new Date('2026-01-03') }),
    msg({ id: 'c', contenido: 'Comprar pan', fecha: new Date('2026-01-02') }),
  ];

  it('devuelve solo las coincidencias, más recientes primero', () => {
    const found = searchMessages(messages, 'factura');
    expect(found.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('respeta el límite de resultados', () => {
    const found = searchMessages(messages, 'factura', 1);
    expect(found.map((m) => m.id)).toEqual(['b']);
  });

  it('una consulta vacía devuelve lista vacía (no todo)', () => {
    expect(searchMessages(messages, '  ')).toEqual([]);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(searchMessages(messages, 'inexistente')).toEqual([]);
  });
});

describe('InMemoryMessageRepository.search', () => {
  it('encuentra por contenido y por resumen, ordenado por fecha desc', async () => {
    const repo = new InMemoryMessageRepository();
    await repo.save({ tipo: 'text', contenido: 'Reunión con Ana', categoria: 'nota', resumen: 'cita' });
    await repo.save({ tipo: 'text', contenido: 'otra cosa', categoria: 'nota', resumen: 'sobre Ana' });

    const found = await repo.search('ana');
    expect(found).toHaveLength(2);
    expect(found.map((m) => m.contenido).sort()).toEqual(['Reunión con Ana', 'otra cosa']);
  });

  it('devuelve lista vacía si no hay coincidencias', async () => {
    const repo = new InMemoryMessageRepository();
    await repo.save({ tipo: 'text', contenido: 'hola', categoria: 'nota', resumen: 'saludo' });
    expect(await repo.search('adiós')).toEqual([]);
  });
});
