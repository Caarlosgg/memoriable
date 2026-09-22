import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('PrismaEventRepository', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('usa el cliente de Prisma COMPARTIDO del proceso, no uno propio', async () => {
    // El import estático de InMemoryEventRepository, arriba del fichero, ya
    // cargó (y cacheó) config/env.js antes de que este test pudiera fijar
    // DATABASE_URL — hace falta invalidar esa caché para que el mock y el
    // stub de abajo tengan efecto de verdad en el import dinámico.
    vi.resetModules();
    const findMany = vi.fn().mockResolvedValue([{ titulo: 'Reunión', fechaInicio: new Date(2026, 6, 29, 10, 0) }]);
    vi.doMock('@prisma/client', () => ({
      PrismaClient: class {
        evento = { findMany };
      },
    }));
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');

    const { PrismaEventRepository } = await import('../src/db/eventRepository.js');
    const from = new Date(2026, 6, 29, 0, 0);
    const to = new Date(2026, 6, 30, 0, 0);
    const result = await new PrismaEventRepository().eventsBetween('u1', from, to);

    expect(findMany).toHaveBeenCalledOnce();
    expect(result).toEqual([{ titulo: 'Reunión', fechaInicio: new Date(2026, 6, 29, 10, 0) }]);

    vi.doUnmock('@prisma/client');
  });
});
