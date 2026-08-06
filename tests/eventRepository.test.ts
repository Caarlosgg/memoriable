import { describe, expect, it } from 'vitest';
import { InMemoryEventRepository } from '../src/db/eventRepository.js';

describe('InMemoryEventRepository', () => {
  it('devuelve solo los eventos cuyo inicio cae en [from, to)', async () => {
    const repo = new InMemoryEventRepository([
      { titulo: 'Ayer', fechaInicio: new Date(2026, 6, 28, 10, 0) },
      { titulo: 'Hoy temprano', fechaInicio: new Date(2026, 6, 29, 8, 0) },
      { titulo: 'Hoy tarde', fechaInicio: new Date(2026, 6, 29, 18, 0) },
      { titulo: 'Mañana', fechaInicio: new Date(2026, 6, 30, 9, 0) },
    ]);

    const result = await repo.eventsBetween('u1', new Date(2026, 6, 29, 0, 0), new Date(2026, 6, 30, 0, 0));

    expect(result.map((e) => e.titulo)).toEqual(['Hoy temprano', 'Hoy tarde']);
  });

  it('ordena por fecha de inicio, los más tempranos primero', async () => {
    const repo = new InMemoryEventRepository([
      { titulo: 'Tarde', fechaInicio: new Date(2026, 6, 29, 18, 0) },
      { titulo: 'Mañana', fechaInicio: new Date(2026, 6, 29, 8, 0) },
    ]);

    const result = await repo.eventsBetween('u1', new Date(2026, 6, 29, 0, 0), new Date(2026, 6, 30, 0, 0));

    expect(result.map((e) => e.titulo)).toEqual(['Mañana', 'Tarde']);
  });

  it('sin eventos, devuelve un array vacío', async () => {
    const repo = new InMemoryEventRepository();
    expect(await repo.eventsBetween('u1', new Date(), new Date())).toEqual([]);
  });
});
