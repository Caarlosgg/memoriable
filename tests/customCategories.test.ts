import { afterEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const findFirst = vi.fn();
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    customCategory = { findMany, findFirst };
  },
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  findMany.mockReset();
  findFirst.mockReset();
});

describe('listCustomCategories', () => {
  it('pide las categorías de ese usuario, más antigua primero', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findMany.mockResolvedValue([{ id: 'c1', nombre: 'Recetas', emoji: '🍳' }]);
    const { listCustomCategories } = await import('../src/db/customCategories.js');

    const result = await listCustomCategories('u1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(result).toEqual([{ id: 'c1', nombre: 'Recetas', emoji: '🍳' }]);
  });

  it('sin DATABASE_URL, devuelve una lista vacía en vez de lanzar — el selector se pinta solo con las fijas', async () => {
    const { listCustomCategories } = await import('../src/db/customCategories.js');
    await expect(listCustomCategories('u1')).resolves.toEqual([]);
  });

  it('ante un fallo de la base de datos, devuelve vacío en vez de tumbar la respuesta del bot', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findMany.mockRejectedValue(new Error('ECONNREFUSED'));
    const { listCustomCategories } = await import('../src/db/customCategories.js');

    await expect(listCustomCategories('u1')).resolves.toEqual([]);
  });
});

describe('findCustomCategory', () => {
  it('pide una categoría concreta filtrando por dueño', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findFirst.mockResolvedValue({ id: 'c1', nombre: 'Recetas', emoji: '🍳' });
    const { findCustomCategory } = await import('../src/db/customCategories.js');

    const result = await findCustomCategory('u1', 'c1');

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1', userId: 'u1' } }));
    expect(result).toEqual({ id: 'c1', nombre: 'Recetas', emoji: '🍳' });
  });

  it('sin DATABASE_URL, devuelve null en vez de lanzar', async () => {
    const { findCustomCategory } = await import('../src/db/customCategories.js');
    await expect(findCustomCategory('u1', 'c1')).resolves.toBeNull();
  });
});
