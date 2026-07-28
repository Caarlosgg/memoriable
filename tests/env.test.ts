import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config/env', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('usa GPT-OSS 120B en Groq como modelo por defecto (coste bajo)', async () => {
    vi.stubEnv('GROQ_MODEL', '');
    const { env } = await import('../src/config/env.js');
    expect(env.GROQ_MODEL).toBe('openai/gpt-oss-120b');
  });

  it('respeta GROQ_MODEL si se define', async () => {
    vi.stubEnv('GROQ_MODEL', 'openai/gpt-oss-20b');
    const { env } = await import('../src/config/env.js');
    expect(env.GROQ_MODEL).toBe('openai/gpt-oss-20b');
  });

  it('los helpers reflejan la ausencia de variables', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('GROQ_API_KEY', '');
    const { hasDatabase, hasTelegram, hasGroq } = await import('../src/config/env.js');
    expect(hasDatabase()).toBe(false);
    expect(hasTelegram()).toBe(false);
    expect(hasGroq()).toBe(false);
  });

  describe('requireEnv', () => {
    it('lanza un error accionable que dice qué falta y cómo conseguirlo', async () => {
      vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
      const { requireEnv, MissingEnvError } = await import('../src/config/env.js');

      let capturado: unknown;
      try {
        requireEnv('TELEGRAM_BOT_TOKEN');
      } catch (err) {
        capturado = err;
      }

      expect(capturado).toBeInstanceOf(MissingEnvError);
      const mensaje = (capturado as Error).message;
      expect(mensaje).toContain('TELEGRAM_BOT_TOKEN');
      expect(mensaje).toContain('Cómo conseguirla');
      expect(mensaje).toContain('@BotFather');
      expect(mensaje).toContain('.env');
    });

    it('explica cómo obtener la API key de Groq', async () => {
      vi.stubEnv('GROQ_API_KEY', '');
      const { requireEnv } = await import('../src/config/env.js');
      expect(() => requireEnv('GROQ_API_KEY')).toThrow(/console\.groq\.com/);
    });

    it('explica cómo obtener la cadena de conexión (Supabase)', async () => {
      vi.stubEnv('DATABASE_URL', '');
      const { requireEnv } = await import('../src/config/env.js');
      expect(() => requireEnv('DATABASE_URL')).toThrow(/supabase\.com/);
    });

    it('devuelve el valor cuando la variable está definida', async () => {
      vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456789:TOKEN-DE-PRUEBA');
      const { requireEnv } = await import('../src/config/env.js');
      expect(requireEnv('TELEGRAM_BOT_TOKEN')).toBe('123456789:TOKEN-DE-PRUEBA');
    });
  });

  describe('MAX_MESSAGES_PER_DAY', () => {
    it('usa 50 por defecto', async () => {
      vi.stubEnv('MAX_MESSAGES_PER_DAY', '');
      const { env } = await import('../src/config/env.js');
      expect(env.MAX_MESSAGES_PER_DAY).toBe(50);
    });

    it('respeta un valor válido', async () => {
      vi.stubEnv('MAX_MESSAGES_PER_DAY', '10');
      const { env } = await import('../src/config/env.js');
      expect(env.MAX_MESSAGES_PER_DAY).toBe(10);
    });

    it('ante un valor inválido cae al defecto y registra un aviso (no rompe)', async () => {
      vi.stubEnv('MAX_MESSAGES_PER_DAY', 'muchos');
      const { env, configWarnings } = await import('../src/config/env.js');
      expect(env.MAX_MESSAGES_PER_DAY).toBe(50);
      expect(configWarnings.join(' ')).toContain('MAX_MESSAGES_PER_DAY');
    });
  });
});
