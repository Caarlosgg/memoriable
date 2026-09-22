import { afterEach, describe, expect, it, vi } from 'vitest';

// Mismo patrón que users.dbMocked.test.ts: `getClient()` importa
// `@prisma/client` de forma perezosa (import dinámico), así que se mockea
// el módulo entero en vez de depender de una base de datos real.
const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    botBudgetCounter = { findUnique, upsert };
  },
}));

describe('PrismaBudgetStore', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    findUnique.mockReset();
    upsert.mockReset();
  });

  it('load consulta por subject y devuelve la fila tal cual', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findUnique.mockResolvedValue({ day: '2026-09-20', used: 3 });
    const { PrismaBudgetStore } = await import('../src/cost/prismaBudgetStore.js');

    const result = await new PrismaBudgetStore().load('u1');

    expect(findUnique).toHaveBeenCalledWith({ where: { subject: 'u1' } });
    expect(result).toEqual({ day: '2026-09-20', used: 3 });
  });

  it('sin sujeto, usa la clave global ("")', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findUnique.mockResolvedValue(null);
    const { PrismaBudgetStore } = await import('../src/cost/prismaBudgetStore.js');

    await new PrismaBudgetStore().load();

    expect(findUnique).toHaveBeenCalledWith({ where: { subject: '' } });
  });

  it('save hace upsert por subject (una fila por sujeto, no una por día)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    upsert.mockResolvedValue({});
    const { PrismaBudgetStore } = await import('../src/cost/prismaBudgetStore.js');

    await new PrismaBudgetStore().save({ day: '2026-09-20', used: 5 }, 'u1');

    expect(upsert).toHaveBeenCalledWith({
      where: { subject: 'u1' },
      create: { subject: 'u1', day: '2026-09-20', used: 5 },
      update: { day: '2026-09-20', used: 5 },
    });
  });

  it('un fallo de base de datos en load se reporta y devuelve null, no lanza', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findUnique.mockRejectedValue(new Error('conexión perdida'));
    const errores: unknown[] = [];
    const { PrismaBudgetStore } = await import('../src/cost/prismaBudgetStore.js');

    const result = await new PrismaBudgetStore((err) => errores.push(err)).load('u1');

    expect(result).toBeNull();
    expect(errores).toHaveLength(1);
  });

  it('un fallo de base de datos en save se reporta y no lanza', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    upsert.mockRejectedValue(new Error('conexión perdida'));
    const errores: unknown[] = [];
    const { PrismaBudgetStore } = await import('../src/cost/prismaBudgetStore.js');

    await expect(
      new PrismaBudgetStore((err) => errores.push(err)).save({ day: '2026-09-20', used: 1 }, 'u1'),
    ).resolves.toBeUndefined();
    expect(errores).toHaveLength(1);
  });

  it('sin DATABASE_URL, lanza un error claro en vez de fallar en carga', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const errores: unknown[] = [];
    const { PrismaBudgetStore } = await import('../src/cost/prismaBudgetStore.js');

    // El error se atrapa dentro de load() y se reporta, no se propaga —
    // mismo criterio que un fallo de red: nunca debe tumbar el pipeline.
    const result = await new PrismaBudgetStore((err) => errores.push(err)).load('u1');
    expect(result).toBeNull();
    expect(errores).toHaveLength(1);
  });
});
