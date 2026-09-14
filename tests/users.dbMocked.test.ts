import { afterEach, describe, expect, it, vi } from 'vitest';

// Mismo patrón que prismaRepository.test.ts: `getClient()` importa
// `@prisma/client` de forma perezosa (import dinámico), así que se mockea
// el módulo entero en vez de depender de una base de datos real.
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const workspaceCreate = vi.fn();
const membershipCreate = vi.fn();
const messageFindFirst = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    user = { findUnique: userFindUnique, create: userCreate, update: userUpdate };
    workspace = { create: workspaceCreate };
    membership = { create: membershipCreate };
    message = { findFirst: messageFindFirst };
    // Las pruebas no verifican atomicidad real (eso es cosa de Postgres) —
    // solo que se llame con la función correcta, así que basta con
    // ejecutarla contra el mismo mock de arriba.
    $transaction = vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user: { create: userCreate, update: userUpdate }, workspace: { create: workspaceCreate }, membership: { create: membershipCreate } }),
    );
  },
}));

describe('db/users (con base de datos, Prisma mockeado)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    userFindUnique.mockReset();
    userCreate.mockReset();
    userUpdate.mockReset();
    workspaceCreate.mockReset();
    membershipCreate.mockReset();
    messageFindFirst.mockReset();
  });

  describe('resolveOrCreateChatOwner', () => {
    it('si el chat ya tiene cuenta, la devuelve tal cual y no crea nada', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      userFindUnique.mockResolvedValue({ id: 'u1' });
      const { resolveOrCreateChatOwner } = await import('../src/db/users.js');

      const result = await resolveOrCreateChatOwner(12345);

      expect(result).toEqual({ userId: 'u1', recienCreado: false });
      expect(userCreate).not.toHaveBeenCalled();
    });

    it('chat nuevo: crea cuenta con email sintético + workspace personal + membership OWNER, y avisa que se acaba de crear', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      userFindUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue({ id: 'nuevo-1' });
      workspaceCreate.mockResolvedValue({ id: 'ws-1' });
      const { resolveOrCreateChatOwner } = await import('../src/db/users.js');

      const result = await resolveOrCreateChatOwner(999);

      expect(result).toEqual({ userId: 'nuevo-1', recienCreado: true });
      expect(userCreate).toHaveBeenCalledWith({
        data: {
          email: 'tg-999@telegram.memoriable.local',
          telegramChatId: 999n,
          accountPending: true,
        },
      });
      expect(workspaceCreate).toHaveBeenCalledWith({ data: { nombre: 'Personal', personal: true } });
      expect(membershipCreate).toHaveBeenCalledWith({
        data: { userId: 'nuevo-1', workspaceId: 'ws-1', role: 'OWNER', status: 'ACTIVE' },
      });
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'nuevo-1' },
        data: { personalWorkspaceId: 'ws-1' },
      });
    });

    it('condición de carrera: si la creación choca (el chat ya se creó entre medias), relee y devuelve la cuenta ganadora sin recienCreado', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'el-que-gano' });
      userCreate.mockRejectedValue(new Error('Unique constraint failed on telegramChatId'));
      const { resolveOrCreateChatOwner } = await import('../src/db/users.js');

      const result = await resolveOrCreateChatOwner(777);

      expect(result).toEqual({ userId: 'el-que-gano', recienCreado: false });
    });

    it('sin DATABASE_URL, usuario de desarrollo en memoria y no toca la BD', async () => {
      vi.stubEnv('DATABASE_URL', '');
      const { resolveOrCreateChatOwner, LOCAL_DEV_USER_ID } = await import('../src/db/users.js');

      const result = await resolveOrCreateChatOwner(1);

      expect(result).toEqual({ userId: LOCAL_DEV_USER_ID, recienCreado: false });
      expect(userFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('linkTelegramChat', () => {
    const futureExpiry = new Date(Date.now() + 10 * 60 * 1000);

    it('chat sin dueño previo: vincula sin más', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      userFindUnique
        .mockResolvedValueOnce({ id: 'destino', linkCodeExpiresAt: futureExpiry }) // busca por linkCode
        .mockResolvedValueOnce(null); // dueño actual del chat: ninguno
      const { linkTelegramChat } = await import('../src/db/users.js');

      const result = await linkTelegramChat('123456', 555);

      expect(result).toBe('linked');
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'destino' },
        data: { telegramChatId: 555n, linkCode: null, linkCodeExpiresAt: null },
      });
    });

    it('chat ya auto-provisionado SIN notas: libera la cuenta vieja y vincula a la nueva', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      userFindUnique
        .mockResolvedValueOnce({ id: 'destino', linkCodeExpiresAt: futureExpiry })
        .mockResolvedValueOnce({ id: 'auto-creado' });
      messageFindFirst.mockResolvedValue(null);
      const { linkTelegramChat } = await import('../src/db/users.js');

      const result = await linkTelegramChat('123456', 555);

      expect(result).toBe('linked');
      expect(userUpdate).toHaveBeenCalledWith({ where: { id: 'auto-creado' }, data: { telegramChatId: null } });
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'destino' },
        data: { telegramChatId: 555n, linkCode: null, linkCodeExpiresAt: null },
      });
    });

    it('chat ya auto-provisionado CON notas: no vincula, no pierde nada, y no cuenta como intento fallido', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      userFindUnique
        .mockResolvedValueOnce({ id: 'destino', linkCodeExpiresAt: futureExpiry })
        .mockResolvedValueOnce({ id: 'auto-creado-con-datos' });
      messageFindFirst.mockResolvedValue({ id: 'una-nota-cualquiera' });
      const { linkTelegramChat } = await import('../src/db/users.js');

      const result = await linkTelegramChat('123456', 555);

      expect(result).toBe('chat_con_datos_propios');
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('código inválido o caducado', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      userFindUnique.mockResolvedValueOnce(null);
      const { linkTelegramChat } = await import('../src/db/users.js');

      expect(await linkTelegramChat('000000', 555)).toBe('invalid_or_expired');
    });
  });
});
