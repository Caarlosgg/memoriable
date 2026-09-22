import { afterEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    botDailySummaryState = { findUnique, upsert };
  },
}));

describe('PrismaSummaryStateStore', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    findUnique.mockReset();
    upsert.mockReset();
  });

  it('lastSentDay consulta por subject y devuelve la marca guardada', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findUnique.mockResolvedValue({ lastSentDay: '2026-09-20' });
    const { PrismaSummaryStateStore } = await import('../src/summary/prismaSummaryStateStore.js');

    const result = await new PrismaSummaryStateStore().lastSentDay('u1');

    expect(findUnique).toHaveBeenCalledWith({ where: { subject: 'u1' } });
    expect(result).toBe('2026-09-20');
  });

  it('sin marca guardada, devuelve undefined', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findUnique.mockResolvedValue(null);
    const { PrismaSummaryStateStore } = await import('../src/summary/prismaSummaryStateStore.js');

    expect(await new PrismaSummaryStateStore().lastSentDay('u1')).toBeUndefined();
  });

  it('sin sujeto, usa la clave global ("")', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findUnique.mockResolvedValue(null);
    const { PrismaSummaryStateStore } = await import('../src/summary/prismaSummaryStateStore.js');

    await new PrismaSummaryStateStore().lastSentDay();

    expect(findUnique).toHaveBeenCalledWith({ where: { subject: '' } });
  });

  it('markSent hace upsert por subject', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    upsert.mockResolvedValue({});
    const { PrismaSummaryStateStore } = await import('../src/summary/prismaSummaryStateStore.js');

    await new PrismaSummaryStateStore().markSent('2026-09-20', 'u1');

    expect(upsert).toHaveBeenCalledWith({
      where: { subject: 'u1' },
      create: { subject: 'u1', lastSentDay: '2026-09-20' },
      update: { lastSentDay: '2026-09-20' },
    });
  });

  it('un fallo de base de datos no lanza: se reporta y se degrada (peor caso, un reenvío de más)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findUnique.mockRejectedValue(new Error('conexión perdida'));
    upsert.mockRejectedValue(new Error('conexión perdida'));
    const errores: unknown[] = [];
    const { PrismaSummaryStateStore } = await import('../src/summary/prismaSummaryStateStore.js');
    const store = new PrismaSummaryStateStore((err) => errores.push(err));

    expect(await store.lastSentDay('u1')).toBeUndefined();
    await expect(store.markSent('2026-09-20', 'u1')).resolves.toBeUndefined();
    expect(errores).toHaveLength(2);
  });
});
