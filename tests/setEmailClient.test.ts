import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpSetEmailClient, NullSetEmailClient } from '../src/ai/setEmailClient.js';

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('HttpSetEmailClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('éxito con correo enviado: ok true, enviado true', async () => {
    vi.stubGlobal('fetch', fakeFetch({ ok: true, enviado: true }));
    const client = new HttpSetEmailClient('https://dashboard.example.com', 'secreto');

    const result = await client.setEmail({ userId: 'u1', email: 'ana@example.com' });

    expect(result).toEqual({ ok: true, enviado: true });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://dashboard.example.com/api/bot/set-email');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secreto');
    expect(JSON.parse(init.body as string)).toEqual({ userId: 'u1', email: 'ana@example.com' });
  });

  it('cuenta guardada pero el correo no salió: ok true, enviado false', async () => {
    vi.stubGlobal('fetch', fakeFetch({ ok: true, enviado: false }));
    const client = new HttpSetEmailClient('https://dashboard.example.com', 'secreto');

    const result = await client.setEmail({ userId: 'u1', email: 'ana@example.com' });

    expect(result).toEqual({ ok: true, enviado: false });
  });

  it('el servidor rechaza (p. ej. correo ya en uso): ok false con el mensaje del servidor', async () => {
    vi.stubGlobal('fetch', fakeFetch({ error: 'Ya hay una cuenta con ese correo.' }, false, 409));
    const client = new HttpSetEmailClient('https://dashboard.example.com', 'secreto');

    const result = await client.setEmail({ userId: 'u1', email: 'ana@example.com' });

    expect(result).toEqual({ ok: false, error: 'Ya hay una cuenta con ese correo.' });
  });

  it('fallo de red: ok false, sin lanzar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch,
    );
    const client = new HttpSetEmailClient('https://dashboard.example.com', 'secreto');

    const result = await client.setEmail({ userId: 'u1', email: 'ana@example.com' });

    expect(result).toEqual({ ok: false });
  });
});

describe('NullSetEmailClient', () => {
  it('siempre ok false', async () => {
    const client = new NullSetEmailClient();
    expect(await client.setEmail()).toEqual({ ok: false });
  });
});

describe('resolveSetEmailClient', () => {
  // `env` (config/env.ts) se calcula UNA vez al importar el módulo. El
  // import estático de arriba ya lo dejó fijado con el entorno real del
  // proceso (el `.env` de desarrollo, que SÍ tiene DASHBOARD_URL/
  // BOT_API_SECRET) — así que aquí hace falta `resetModules` ANTES de cada
  // import dinámico, no solo `stubEnv`, o se sigue reutilizando ese mismo
  // módulo ya cacheado con los valores reales.
  afterEach(() => vi.unstubAllEnvs());

  it('sin DASHBOARD_URL/BOT_API_SECRET, devuelve el cliente nulo', async () => {
    vi.stubEnv('DASHBOARD_URL', '');
    vi.stubEnv('BOT_API_SECRET', '');
    vi.resetModules();
    const { resolveSetEmailClient: resolve, NullSetEmailClient: Null } = await import('../src/ai/setEmailClient.js');
    expect(resolve()).toBeInstanceOf(Null);
  });

  it('con las dos variables, devuelve el cliente HTTP', async () => {
    vi.stubEnv('DASHBOARD_URL', 'https://dashboard.example.com');
    vi.stubEnv('BOT_API_SECRET', 'secreto');
    vi.resetModules();
    const { resolveSetEmailClient: resolve, HttpSetEmailClient: Http } = await import('../src/ai/setEmailClient.js');
    expect(resolve()).toBeInstanceOf(Http);
  });
});
