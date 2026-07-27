import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

/**
 * Crea un cliente de Anthropic de forma perezosa. Solo se llama cuando se
 * necesita categorizar de verdad; si falta la API key, lanza un error claro en
 * vez de fallar silenciosamente o al importar el módulo.
 */
export function createAnthropicClient(apiKey: string | undefined = env.ANTHROPIC_API_KEY): Anthropic {
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY no está definida: no se puede crear el cliente de Anthropic.',
    );
  }
  return new Anthropic({ apiKey });
}
