import { env, hasAnthropic, hasDatabase, hasTelegram } from './config/env.js';
import { logConfigWarnings, logger } from './logging/index.js';
import { resolvePipeline } from './pipeline/factory.js';
import { startBot } from './telegram/bot.js';

/**
 * Punto de entrada. Reporta el estado de la configuración de forma
 * estructurada y arranca el bot en polling si hay token. Nada de esto rompe si
 * faltan secretos: cada pieza se degrada de forma explícita y registrada.
 */
function main(): void {
  logConfigWarnings();

  logger.info('app.starting', {
    telegram: hasTelegram() ? 'configurado' : 'FALTA TELEGRAM_BOT_TOKEN',
    database: hasDatabase() ? 'configurada' : 'FALTA DATABASE_URL (memoria volátil)',
    anthropic: hasAnthropic() ? 'configurada' : 'FALTA ANTHROPIC_API_KEY (modo offline)',
    model: env.ANTHROPIC_MODEL,
    maxMessagesPerDay: env.MAX_MESSAGES_PER_DAY,
  });

  startBot(resolvePipeline());
}

main();
