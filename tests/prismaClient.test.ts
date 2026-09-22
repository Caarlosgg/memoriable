import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getSharedPrismaClient', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.doUnmock('@prisma/client');
  });

  it('crea el cliente una sola vez: llamadas repetidas devuelven la MISMA instancia', async () => {
    const instancesCreated: unknown[] = [];
    vi.doMock('@prisma/client', () => ({
      PrismaClient: class {
        constructor() {
          instancesCreated.push(this);
        }
      },
    }));
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');

    const { getSharedPrismaClient } = await import('../src/db/prismaClient.js');
    const a = await getSharedPrismaClient();
    const b = await getSharedPrismaClient();

    expect(a).toBe(b);
    expect(instancesCreated).toHaveLength(1);
  });

  it('sin DATABASE_URL, lanza un error claro en vez de intentar conectar', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getSharedPrismaClient } = await import('../src/db/prismaClient.js');

    await expect(getSharedPrismaClient()).rejects.toThrow(/DATABASE_URL/);
  });
});
