import { describe, expect, it, vi } from 'vitest';
import { OfflineCategorizer } from '../src/ai/offlineCategorizer.js';
import {
  ResilientCategorizer,
  TimeoutError,
  isTransientError,
  retryAfterMs,
  withTimeout,
} from '../src/ai/resilientCategorizer.js';
import type { Categorizer } from '../src/ai/types.js';
import { createMemoryLogger } from '../src/logging/logger.js';

const mensaje = { tipo: 'text', contenido: 'Comprar pan' };
const RESPUESTA_OK = { categoria: 'idea' as const, resumen: 'de la API' };

/** Construye un categorizador de prueba y una espera instantánea. */
function build(primary: Categorizer, policy = {}) {
  const { logger, records } = createMemoryLogger();
  const sleeps: number[] = [];
  const categorizer = new ResilientCategorizer(primary, new OfflineCategorizer(), {
    logger,
    policy: { baseDelayMs: 10, maxDelayMs: 100, timeoutMs: 50, ...policy },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0, // jitter determinista
  });
  return { categorizer, records, sleeps };
}

function apiError(status: number, headers?: Record<string, string>) {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers });
}

describe('isTransientError', () => {
  it('considera transitorios rate limits, 5xx y timeouts de red', () => {
    expect(isTransientError(apiError(429))).toBe(true);
    expect(isTransientError(apiError(500))).toBe(true);
    expect(isTransientError(apiError(529))).toBe(true);
    expect(isTransientError(apiError(408))).toBe(true);
    expect(isTransientError(new TimeoutError(10))).toBe(true);
    expect(isTransientError(Object.assign(new Error('net'), { code: 'ECONNRESET' }))).toBe(true);
  });

  it('considera permanentes los errores de cliente (no se reintentan)', () => {
    expect(isTransientError(apiError(400))).toBe(false);
    expect(isTransientError(apiError(401))).toBe(false);
    expect(isTransientError(apiError(404))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe('retryAfterMs', () => {
  it('lee la cabecera retry-after en segundos', () => {
    expect(retryAfterMs(apiError(429, { 'retry-after': '3' }))).toBe(3000);
  });

  it('devuelve undefined si no hay cabecera o no es numérica', () => {
    expect(retryAfterMs(apiError(429))).toBeUndefined();
    expect(retryAfterMs(apiError(429, { 'retry-after': 'luego' }))).toBeUndefined();
  });
});

describe('withTimeout', () => {
  it('resuelve si la promesa llega a tiempo', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('lanza TimeoutError si se pasa del límite', async () => {
    const lenta = new Promise((resolve) => setTimeout(resolve, 5000).unref?.());
    await expect(withTimeout(lenta, 20)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('ResilientCategorizer', () => {
  it('devuelve la respuesta de la API cuando todo va bien', async () => {
    const primary: Categorizer = { analyze: vi.fn().mockResolvedValue(RESPUESTA_OK) };
    const { categorizer } = build(primary);

    await expect(categorizer.analyze(mensaje)).resolves.toEqual(RESPUESTA_OK);
    expect(primary.analyze).toHaveBeenCalledOnce();
  });

  it('reintenta ante un fallo transitorio y acaba devolviendo la respuesta buena', async () => {
    const primary: Categorizer = {
      analyze: vi
        .fn()
        .mockRejectedValueOnce(apiError(503))
        .mockResolvedValueOnce(RESPUESTA_OK),
    };
    const { categorizer, records, sleeps } = build(primary);

    await expect(categorizer.analyze(mensaje)).resolves.toEqual(RESPUESTA_OK);
    expect(primary.analyze).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([10]);
    expect(records.find((r) => r.event === 'ai.retry_succeeded')).toBeDefined();
  });

  it('aplica backoff exponencial entre reintentos', async () => {
    const primary: Categorizer = { analyze: vi.fn().mockRejectedValue(apiError(500)) };
    const { categorizer, sleeps } = build(primary, { retries: 3 });

    await categorizer.analyze(mensaje);
    expect(sleeps).toEqual([10, 20, 40]); // 2^n * baseDelay, sin jitter
  });

  it('respeta la cabecera retry-after de un rate limit', async () => {
    const primary: Categorizer = {
      analyze: vi
        .fn()
        .mockRejectedValueOnce(apiError(429, { 'retry-after': '0.05' }))
        .mockResolvedValueOnce(RESPUESTA_OK),
    };
    const { categorizer, sleeps } = build(primary);

    await categorizer.analyze(mensaje);
    expect(sleeps).toEqual([50]);
  });

  it('si retry-after supera el techo, no espera: cae a offline de inmediato', async () => {
    const primary: Categorizer = {
      analyze: vi.fn().mockRejectedValue(apiError(429, { 'retry-after': '600' })),
    };
    const { categorizer, records, sleeps } = build(primary);

    const resultado = await categorizer.analyze(mensaje);
    expect(sleeps).toEqual([]);
    expect(primary.analyze).toHaveBeenCalledOnce();
    expect(resultado.categoria).toBe('tarea'); // heurístico offline
    expect(records.find((r) => r.event === 'ai.retry_after_too_long')).toBeDefined();
  });

  it('NO reintenta ante errores permanentes (401) y avisa de la causa', async () => {
    const primary: Categorizer = { analyze: vi.fn().mockRejectedValue(apiError(401)) };
    const { categorizer, records } = build(primary);

    const resultado = await categorizer.analyze(mensaje);

    expect(primary.analyze).toHaveBeenCalledOnce();
    expect(resultado).toHaveProperty('categoria');
    expect(records.find((r) => r.event === 'ai.auth_failed')).toMatchObject({
      level: 'error',
      hint: expect.stringContaining('GROQ_API_KEY'),
    });
  });

  it('cae al offline (sin lanzar) cuando se agotan los reintentos', async () => {
    const primary: Categorizer = { analyze: vi.fn().mockRejectedValue(apiError(500)) };
    const { categorizer, records } = build(primary);

    const resultado = await categorizer.analyze(mensaje);

    expect(primary.analyze).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
    expect(resultado.categoria).toBe('tarea');
    expect(records.find((r) => r.event === 'ai.fallback_offline')).toMatchObject({
      level: 'error',
      errorMessage: 'HTTP 500',
    });
  });

  it('trata un cuelgue de la API como timeout y cae a offline', async () => {
    const primary: Categorizer = {
      analyze: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10_000).unref?.()),
      ),
    };
    const { categorizer, records } = build(primary, { timeoutMs: 20, retries: 1 });

    const resultado = await categorizer.analyze(mensaje);

    expect(resultado).toHaveProperty('categoria');
    expect(records.some((r) => r.errorName === 'TimeoutError')).toBe(true);
  });

  it('un fallo de la API nunca propaga excepción al pipeline', async () => {
    const primary: Categorizer = {
      analyze: vi.fn().mockRejectedValue(new Error('caída total')),
    };
    const { categorizer } = build(primary);
    await expect(categorizer.analyze(mensaje)).resolves.toHaveProperty('resumen');
  });
});
