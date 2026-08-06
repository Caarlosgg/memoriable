import { errorContext, type Logger } from '../logging/logger.js';
import type { BriefingGenerator, BriefingInput, BriefingResult } from './briefing.js';
import {
  DEFAULT_RETRY_POLICY,
  isTransientError,
  retryAfterMs,
  withTimeout,
  type RetryPolicy,
} from './resilientCategorizer.js';

export interface ResilientBriefingGeneratorOptions {
  policy?: Partial<RetryPolicy>;
  logger?: Logger;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

/**
 * Mismo decorador de resiliencia que `ResilientCategorizer` (timeout +
 * reintentos con backoff, caída a un generador offline), pero para
 * `BriefingGenerator` — la forma de entrada/salida es distinta, así que no
 * comparten clase, pero sí toda la lógica de reintento (importada de
 * `resilientCategorizer.ts`, no duplicada).
 */
export class ResilientBriefingGenerator implements BriefingGenerator {
  private readonly policy: RetryPolicy;
  private readonly logger: Logger | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly primary: BriefingGenerator,
    private readonly fallback: BriefingGenerator,
    options: ResilientBriefingGeneratorOptions = {},
  ) {
    this.policy = { ...DEFAULT_RETRY_POLICY, ...options.policy };
    this.logger = options.logger;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  private backoffMs(attempt: number): number {
    const exponential = this.policy.baseDelayMs * 2 ** attempt;
    const capped = Math.min(exponential, this.policy.maxDelayMs);
    const jitter = capped * 0.25 * this.random();
    return Math.round(capped + jitter);
  }

  async generate(input: BriefingInput): Promise<BriefingResult> {
    const maxAttempts = this.policy.retries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await withTimeout(this.primary.generate(input), this.policy.timeoutMs);
        if (attempt > 0) this.logger?.info('briefing.retry_succeeded', { attempt });
        return result;
      } catch (err) {
        lastError = err;
        const transient = isTransientError(err);
        const status = (err as { status?: unknown })?.status;

        this.logger?.warn('briefing.request_failed', { attempt, maxAttempts, transient, ...errorContext(err) });

        if (status === 401 || status === 403) {
          this.logger?.error('briefing.auth_failed', {
            hint: 'Revisa GROQ_API_KEY: la clave es inválida o no tiene permisos.',
          });
          break;
        }
        if (!transient || attempt === maxAttempts - 1) break;

        const suggested = retryAfterMs(err);
        if (suggested !== undefined && suggested > this.policy.maxDelayMs) {
          this.logger?.warn('briefing.retry_after_too_long', { retryAfterMs: suggested });
          break;
        }
        const delayMs = suggested ?? this.backoffMs(attempt);
        this.logger?.info('briefing.retrying', { attempt, delayMs });
        await this.sleep(delayMs);
      }
    }

    this.logger?.error('briefing.fallback_offline', {
      reason: 'la API de Groq no respondió correctamente',
      ...errorContext(lastError),
    });
    return this.fallback.generate(input);
  }
}
