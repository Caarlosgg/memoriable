import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config/env', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('usa el modelo por defecto si no se define ANTHROPIC_MODEL', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', '');
    const { env } = await import('../src/config/env.js');
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-4-8');
  });

  it('los helpers reflejan la ausencia de variables', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { hasDatabase, hasTelegram, hasAnthropic } = await import('../src/config/env.js');
    expect(hasDatabase()).toBe(false);
    expect(hasTelegram()).toBe(false);
    expect(hasAnthropic()).toBe(false);
  });
});
