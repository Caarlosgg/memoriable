import { afterEach, describe, expect, it, vi } from 'vitest';

describe('db/users (sin DATABASE_URL)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('resolveChatOwner devuelve el usuario de desarrollo en modo memoria', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { resolveChatOwner, LOCAL_DEV_USER_ID } = await import('../src/db/users.js');

    expect(await resolveChatOwner(12345)).toBe(LOCAL_DEV_USER_ID);
  });

  it('linkTelegramChat avisa de que no hay base de datos en modo memoria', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { linkTelegramChat } = await import('../src/db/users.js');

    expect(await linkTelegramChat('123456', 12345)).toBe('no_database');
  });
});
