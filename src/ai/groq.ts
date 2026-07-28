import Groq from 'groq-sdk';
import { MissingEnvError, env } from '../config/env.js';

/** Timeout por defecto de cada petición a la API (ms). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export interface GroqClientOptions {
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
 * Crea un cliente de Groq de forma perezosa. Solo se llama cuando se necesita
 * categorizar de verdad; si falta la API key, lanza `MissingEnvError` con
 * instrucciones concretas en vez de un fallo críptico.
 */
export function createGroqClient(options: GroqClientOptions = {}): Groq {
  const apiKey = options.apiKey ?? env.GROQ_API_KEY;
  if (!apiKey) throw new MissingEnvError('GROQ_API_KEY');

  return new Groq({
    apiKey,
    timeout: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? 0,
  });
}
