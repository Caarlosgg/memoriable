import { describe, expect, it, vi, beforeEach } from 'vitest';

const listTelegramUsers = vi.fn();
const resolveChatOwner = vi.fn();
vi.mock('../src/db/users.js', () => ({
  listTelegramUsers: () => listTelegramUsers(),
  resolveChatOwner: (chatId: number) => resolveChatOwner(chatId),
}));

beforeEach(() => {
  listTelegramUsers.mockReset();
  resolveChatOwner.mockReset();
});

describe('destinatariosDelResumen', () => {
  it('manda a TODOS los que tengan Telegram vinculado, no solo al operador', async () => {
    // El bug que arregla: antes iba a un TELEGRAM_CHAT_ID global, así que el
    // resumen diario funcionaba para exactamente una persona.
    listTelegramUsers.mockResolvedValue([
      { userId: 'ana', chatId: 111 },
      { userId: 'bruno', chatId: 222 },
    ]);
    const { destinatariosDelResumen } = await import('../src/summary/scheduler.js');

    expect(await destinatariosDelResumen('999')).toEqual([
      { userId: 'ana', chatId: 111 },
      { userId: 'bruno', chatId: 222 },
    ]);
    // Con usuarios reales, la variable de entorno ni se mira.
    expect(resolveChatOwner).not.toHaveBeenCalled();
  });

  it('sin base de datos cae a TELEGRAM_CHAT_ID, para no romper el desarrollo local', async () => {
    listTelegramUsers.mockResolvedValue([]);
    resolveChatOwner.mockResolvedValue('local-dev');
    const { destinatariosDelResumen } = await import('../src/summary/scheduler.js');

    expect(await destinatariosDelResumen('123')).toEqual([{ userId: 'local-dev', chatId: 123 }]);
  });

  it('sin usuarios y sin variable de entorno, no hay a quién mandar', async () => {
    listTelegramUsers.mockResolvedValue([]);
    const { destinatariosDelResumen } = await import('../src/summary/scheduler.js');

    expect(await destinatariosDelResumen(undefined)).toEqual([]);
    expect(resolveChatOwner).not.toHaveBeenCalled();
  });

  it('un TELEGRAM_CHAT_ID sin vincular no cuenta como destinatario', async () => {
    listTelegramUsers.mockResolvedValue([]);
    resolveChatOwner.mockResolvedValue(null);
    const { destinatariosDelResumen } = await import('../src/summary/scheduler.js');

    expect(await destinatariosDelResumen('123')).toEqual([]);
  });
});
