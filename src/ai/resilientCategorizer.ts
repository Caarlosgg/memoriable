import { errorContext, type Logger } from '../logging/logger.js';
import type { Analysis, Categorizer, IncomingMessage } from './types.js';

/** La petición superó el tiempo máximo permitido. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`La petición a la API superó el timeout de ${ms} ms.`);
    this.name = 'TimeoutError';
  }
}

export interface RetryPolicy {
  /** Reintentos DESPUÉS del primer intento. */
  retries: number;
  /** Espera base del backoff exponencial (ms). */
  baseDelayMs: number;
  /** Techo de espera entre reintentos (ms). */
  maxDelayMs: number;
  /** Tiempo máximo por intento (ms). */
  timeoutMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  retries: 2,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  timeoutMs: 20_000,
};

/** Códigos de red que indican un fallo transitorio. */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ECONNABORTED',
]);

/** Estados HTTP que merece la pena reintentar. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/**
 * Distingue fallos transitorios (merece reintentar) de permanentes (API key
 * inválida, petición mal formada): reintentar un 401 solo quema tiempo.
 */
export function isTransientError(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;

  const candidate = err as { status?: unknown; code?: unknown; name?: unknown } | null;
  if (!candidate) return false;

  if (typeof candidate.status === 'number') return isTransientStatus(candidate.status);
  if (typeof candidate.code === 'string' && TRANSIENT_CODES.has(candidate.code)) return true;

  // Errores de conexión/timeout de la SDK de Groq.
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  return name === 'APIConnectionError' || name === 'APIConnectionTimeoutError';
}

/** Lee la cabecera `retry-after` (segundos) si la API la envía. */
export function retryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown })?.headers;
  if (!headers) return undefined;

  const get = (key: string): string | undefined => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(key) ?? undefined;
    }
    const record = headers as Record<string, unknown>;
    const value = record[key] ?? record[key.toLowerCase()];
    return typeof value === 'string' ? value : undefined;
  };

  const raw = get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/** Corre una promesa con límite de tiempo (no cancela, pero deja de esperar). */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
        // No mantiene vivo el proceso solo por este temporizador.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ResilientCategorizerOptions {
  policy?: Partial<RetryPolicy>;
  logger?: Logger;
  /** Inyectable para tests (evita esperas reales). */
  sleep?: (ms: number) => Promise<void>;
  /** Inyectable para tests (jitter determinista). */
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

/**
 * Decorador que hace robusta la llamada a la API de Groq:
 *
 * - timeout por intento,
 * - reintentos con backoff exponencial + jitter ante fallos transitorios
 *   (rate limits, 5xx, cortes de red), respetando `retry-after`,
 * - y, si todo falla, caída al categorizador offline registrando el motivo.
 *
 * Un fallo de la API nunca tira abajo el proceso: como mucho degrada la
 * calidad de la categorización.
 */
export class ResilientCategorizer implements Categorizer {
  private readonly policy: RetryPolicy;
  private readonly logger: Logger | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly primary: Categorizer,
    private readonly fallback: Categorizer,
    options: ResilientCategorizerOptions = {},
  ) {
    this.policy = { ...DEFAULT_RETRY_POLICY, ...options.policy };
    this.logger = options.logger;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  /** Espera del intento `attempt` (0-indexado), con jitter y techo. */
  private backoffMs(attempt: number): number {
    const exponential = this.policy.baseDelayMs * 2 ** attempt;
    const capped = Math.min(exponential, this.policy.maxDelayMs);
    const jitter = capped * 0.25 * this.random();
    return Math.round(capped + jitter);
  }

  async analyze(message: IncomingMessage): Promise<Analysis> {
    const maxAttempts = this.policy.retries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const analysis = await withTimeout(this.primary.analyze(message), this.policy.timeoutMs);
        if (attempt > 0) this.logger?.info('ai.retry_succeeded', { attempt });
        return analysis;
      } catch (err) {
        lastError = err;
        const transient = isTransientError(err);
        const status = (err as { status?: unknown })?.status;

        this.logger?.warn('ai.request_failed', {
          attempt,
          maxAttempts,
          transient,
          ...errorContext(err),
        });

        if (status === 401 || status === 403) {
          this.logger?.error('ai.auth_failed', {
            hint: 'Revisa GROQ_API_KEY: la clave es inválida o no tiene permisos.',
          });
          break;
        }

        if (!transient || attempt === maxAttempts - 1) break;

        const suggested = retryAfterMs(err);
        if (suggested !== undefined && suggested > this.policy.maxDelayMs) {
          // Esperar más que el techo no compensa: mejor responder ya en offline.
          this.logger?.warn('ai.retry_after_too_long', { retryAfterMs: suggested });
          break;
        }

        const delayMs = suggested ?? this.backoffMs(attempt);
        this.logger?.info('ai.retrying', { attempt, delayMs });
        await this.sleep(delayMs);
      }
    }

    this.logger?.error('ai.fallback_offline', {
      reason: 'la API de Groq no respondió correctamente',
      ...errorContext(lastError),
    });
    return this.fallback.analyze(message);
  }
}
