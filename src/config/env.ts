import 'dotenv/config';

/**
 * Lectura centralizada de variables de entorno.
 *
 * No lanza al importarse: los valores ausentes quedan como `undefined`. Cada
 * módulo decide, de forma perezosa, si puede arrancar o no. Así el resto del
 * sistema sigue siendo ejecutable y testeable aunque falten secretos.
 */

const DEFAULT_MODEL = 'claude-opus-4-8';

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
} as const;

export function hasDatabase(): boolean {
  return Boolean(env.DATABASE_URL);
}

export function hasTelegram(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

export function hasAnthropic(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
