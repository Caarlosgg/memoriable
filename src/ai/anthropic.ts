import Anthropic from '@anthropic-ai/sdk';
import { MissingEnvError, env } from '../config/env.js';

/** Timeout por defecto de cada petición a la API (ms). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export interface AnthropicClientOptions {
  apiKey?: string | undefined;
  timeoutMs?: number;
  /**
   * Reintentos internos de la SDK. Los dejamos a 0: el backoff y los
   * reintentos los gobierna `ResilientCategorizer`, para tener un único punto
   * de control (y de logging) sobre el coste y la latencia.
   */
  maxRetries?: number;
}

/**
 * Crea un cliente de Anthropic de forma perezosa. Solo se llama cuando se
 * necesita categorizar de verdad; si falta la API key, lanza `MissingEnvError`
 * con instrucciones concretas en vez de un fallo críptico.
 */
export function createAnthropicClient(options: AnthropicClientOptions = {}): Anthropic {
  const apiKey = options.apiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingEnvError('ANTHROPIC_API_KEY');

  return new Anthropic({
    apiKey,
    timeout: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? 0,
  });
}
