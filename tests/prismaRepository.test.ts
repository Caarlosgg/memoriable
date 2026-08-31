import { afterEach, describe, expect, it, vi } from 'vitest';

// `getClient()` importa `@prisma/client` de forma perezosa (import dinámico
// dentro del método) — se mockea el módulo entero para no depender de una
// base de datos real, con un `findMany` espía compartido entre tests.
const findMany = vi.fn();
const findFirst = vi.fn();
const updateMany = vi.fn();
const customCategoryFindFirst = vi.fn();
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    message = { create: vi.fn(), findMany, findFirst, updateMany };
    user = { findUnique: vi.fn() };
    customCategory = { findFirst: customCategoryFindFirst };
    $executeRaw = vi.fn();
  },
}));

describe('PrismaMessageRepository.pending', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    findMany.mockReset();
    findFirst.mockReset();
    updateMany.mockReset();
  });

  it('pide las propias Y las asignadas por otros en un equipo del que se sigue siendo miembro ACTIVO', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findMany.mockResolvedValue([]);
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    await repo.pending('u1');

    // Antes solo se filtraba por `userId` (quien la creó) — una tarea
    // asignada a "u1" por otra persona nunca aparecía en su /pendientes de
    // Telegram, porque `assigneeId` nunca se miraba. Fijar la forma exacta
    // del `where` es lo que evita que esto se rompa otra vez sin que nadie
    // se dé cuenta.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hecho: false,
          OR: [
            { userId: 'u1' },
            {
              assigneeId: 'u1',
              workspace: { memberships: { some: { userId: 'u1', status: 'ACTIVE' } } },
            },
          ],
        }),
        include: { user: { select: { email: true } } },
      }),
    );
  });

  it('anota quién asignó una tarea que no es propia, y omite el campo en las propias', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    findMany.mockResolvedValue([
      {
        id: 'm1',
        userId: 'jefe',
        tipo: 'text',
        contenido: 'revisar el informe',
        categoria: 'tarea',
        resumen: 'revisar informe',
        hecho: false,
        fecha: new Date('2026-08-20T10:00:00.000Z'),
        user: { email: 'jefe@example.com' },
      },
      {
        id: 'm2',
        userId: 'u1',
        tipo: 'text',
        contenido: 'propia',
        categoria: 'tarea',
        resumen: 'propia',
        hecho: false,
        fecha: new Date('2026-08-20T09:00:00.000Z'),
        user: { email: 'u1@example.com' },
      },
    ]);
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    const result = await repo.pending('u1');

    expect(result[0]).toMatchObject({ id: 'm1', asignadaPor: 'jefe@example.com' });
    expect(result[1]).toMatchObject({ id: 'm2', asignadaPor: undefined });
    // El objeto `user` del include no debe quedarse colgando en el
    // resultado — StoredMessage no lo declara, solo `asignadaPor`.
    expect(result[0]).not.toHaveProperty('user');
  });
});

describe('PrismaMessageRepository.markDone', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    findFirst.mockReset();
    updateMany.mockReset();
  });

  it('pone hecho Y estado a la vez — nunca uno sin el otro', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'm1', userId: 'u1', hecho: true, categoria: 'tarea' });
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    await repo.markDone('u1', 'm1');

    // El schema exige `hecho = (estado == HECHO)` — si el bot solo tocara
    // `hecho`, el tablero kanban del dashboard seguiría mostrando la
    // tarjeta como "por hacer" mientras el bot ya la da por cerrada.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', userId: 'u1' },
      data: { hecho: true, estado: 'HECHO' },
    });
  });

  it('con un id ajeno o inventado no toca nada y devuelve null', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    updateMany.mockResolvedValue({ count: 0 });
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    await expect(repo.markDone('u1', 'ajeno')).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('PrismaMessageRepository.recategorize', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    findFirst.mockReset();
    updateMany.mockReset();
  });

  it('cambia solo la categoría, filtrando por dueño', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'm1', userId: 'u1', categoria: 'tarea' });
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    const result = await repo.recategorize('u1', 'm1', 'tarea');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', userId: 'u1' },
      data: { categoria: 'tarea' },
    });
    expect(result?.categoria).toBe('tarea');
  });

  it('con un id ajeno o inventado no toca nada y devuelve null', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    updateMany.mockResolvedValue({ count: 0 });
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    await expect(repo.recategorize('u2', 'm1', 'idea')).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('PrismaMessageRepository.setCustomCategory', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    findFirst.mockReset();
    updateMany.mockReset();
    customCategoryFindFirst.mockReset();
  });

  it('verifica que la categoría propia sea de ESTE usuario ANTES de escribir', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    // Sin esto, alguien podría etiquetar su nota con el id de la categoría
    // propia de OTRO usuario — la clave foránea de Postgres solo garantiza
    // que la fila exista, no que sea suya.
    customCategoryFindFirst.mockResolvedValue(null);
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    const result = await repo.setCustomCategory('u1', 'm1', 'cc-ajena');

    expect(customCategoryFindFirst).toHaveBeenCalledWith({ where: { id: 'cc-ajena', userId: 'u1' } });
    expect(updateMany).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('con una categoría propia de verdad, actualiza SOLO customCategoryId', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    customCategoryFindFirst.mockResolvedValue({ id: 'cc1' });
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'm1', userId: 'u1', categoria: 'nota', customCategoryId: 'cc1' });
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    const result = await repo.setCustomCategory('u1', 'm1', 'cc1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', userId: 'u1' },
      data: { customCategoryId: 'cc1' },
    });
    expect(result?.customCategoryId).toBe('cc1');
  });

  it('con null, quita la etiqueta sin comprobar propiedad (no hay nada que verificar)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'm1', userId: 'u1', categoria: 'nota', customCategoryId: null });
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    const result = await repo.setCustomCategory('u1', 'm1', null);

    expect(customCategoryFindFirst).not.toHaveBeenCalled();
    expect(result?.customCategoryId).toBeNull();
  });

  it('con un id de mensaje ajeno o inventado no toca nada y devuelve null', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    customCategoryFindFirst.mockResolvedValue({ id: 'cc1' });
    updateMany.mockResolvedValue({ count: 0 });
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const repo = new PrismaMessageRepository();

    await expect(repo.setCustomCategory('u2', 'm-ajeno', 'cc1')).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
