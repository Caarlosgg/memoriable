import { configWarnings, env } from '../config/env.js';
import { createLogger, normalizeLevel, type Logger } from './logger.js';

export * from './logger.js';

/**
 * Logger raíz de la aplicación. El nivel se controla con `LOG_LEVEL`
 * (debug|info|warn|error); por defecto `info`. En tests se usa
 * `createMemoryLogger()` en vez de este.
 */
export const logger: Logger = createLogger({
  level: normalizeLevel(env.LOG_LEVEL),
  base: { service: 'telegram-claude-classifier' },
});

/** Emite por el logger los avisos de configuración acumulados al arrancar. */
export function logConfigWarnings(target: Logger = logger): void {
  for (const warning of configWarnings) {
    target.warn('config.invalid_value', { detail: warning });
  }
}
