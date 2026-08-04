import { describe, expect, it } from 'vitest';
import { isPending, pendingMessages } from '../src/db/pending.js';
import { InMemoryMessageRepository, type StoredMessage } from '../src/db/repository.js';

function msg(overrides: Partial<StoredMessage> & { id: string }): StoredMessage {
  return {
    tipo: 'text',
    contenido: '',
    categoria: 'tarea',
    resumen: '',
    hecho: false,
    fecha: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'u1',
    ...overrides,
  };
}

describe('isPending', () => {
  it('una tarea no hecha está pendiente', () => {
    expect(isPending({ categoria: 'tarea', hecho: false })).toBe(true);
  });

  it('un recordatorio no hecho está pendiente', () => {
    expect(isPending({ categoria: 'recordatorio', hecho: false })).toBe(true);
  });

  it('una tarea ya hecha no está pendiente', () => {
    expect(isPending({ categoria: 'tarea', hecho: true })).toBe(false);
  });

  it('categorías no accionables nunca están pendientes, aunque no estén hechas', () => {
    for (const categoria of ['idea', 'nota', 'pregunta', 'otro']) {
      expect(isPending({ categoria, hecho: false })).toBe(false);
    }
  });
});

describe('pendingMessages', () => {
  const messages: StoredMessage[] = [
    msg({ id: 'a', categoria: 'tarea', hecho: false, fecha: new Date('2026-01-01') }),
    msg({ id: 'b', categoria: 'recordatorio', hecho: false, fecha: new Date('2026-01-03') }),
    msg({ id: 'c', categoria: 'tarea', hecho: true, fecha: new Date('2026-01-04') }),
    msg({ id: 'd', categoria: 'nota', hecho: false, fecha: new Date('2026-01-05') }),
    msg({ id: 'e', categoria: 'tarea', hecho: false, fecha: new Date('2026-01-02') }),
  ];

  it('devuelve solo accionables no hechos, más recientes primero', () => {
    // Excluye c (hecha) y d (nota); ordena b > e > a por fecha desc.
    expect(pendingMessages(messages).map((m) => m.id)).toEqual(['b', 'e', 'a']);
  });

  it('respeta el límite', () => {
    expect(pendingMessages(messages, 2).map((m) => m.id)).toEqual(['b', 'e']);
  });

  it('sin pendientes devuelve lista vacía', () => {
    const hechos = [msg({ id: 'x', categoria: 'tarea', hecho: true })];
    expect(pendingMessages(hechos)).toEqual([]);
  });
});

describe('InMemoryMessageRepository.pending', () => {
  it('los mensajes nacen pendientes y solo aparecen los accionables', async () => {
    const repo = new InMemoryMessageRepository();
    await repo.save('u1', { tipo: 'text', contenido: 'Comprar pan', categoria: 'tarea', resumen: 'compra' });
    await repo.save('u1', { tipo: 'text', contenido: 'Idea genial', categoria: 'idea', resumen: 'idea' });
    await repo.save('u1', { tipo: 'text', contenido: 'Llamar médico', categoria: 'recordatorio', resumen: 'cita' });

    const pending = await repo.pending('u1');
    expect(pending.map((m) => m.contenido).sort()).toEqual(['Comprar pan', 'Llamar médico']);
    expect(pending.every((m) => m.hecho === false)).toBe(true);
  });
});
