import { afterEach, describe, expect, it, vi } from 'vitest';

// `getClient()` importa `@prisma/client` de forma perezosa (import dinámico
// dentro del método) — se mockea el módulo entero para no depender de una
// base de datos real, con un `findMany` espía compartido entre tests.
const findMany = vi.fn();
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    message = { create: vi.fn(), findMany };
    user = { findUnique: vi.fn() };
    $executeRaw = vi.fn();
  },
}));

describe('PrismaMessageRepository.pending', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    findMany.mockReset();
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
