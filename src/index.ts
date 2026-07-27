import { hasAnthropic, hasDatabase, hasTelegram } from './config/env.js';
import { startBot } from './telegram/bot.js';

/**
 * Punto de entrada. Reporta el estado de las variables de entorno y arranca el
 * bot en polling si hay token. Nada de esto rompe si faltan secretos.
 */
function main(): void {
  console.log('— Estado del entorno —');
  console.log(`  DATABASE_URL:        ${hasDatabase() ? 'definida' : 'FALTA (usaría memoria)'}`);
  console.log(`  TELEGRAM_BOT_TOKEN:  ${hasTelegram() ? 'definido' : 'FALTA (bot no arranca)'}`);
  console.log(`  ANTHROPIC_API_KEY:   ${hasAnthropic() ? 'definida' : 'FALTA (categorizador offline)'}`);
  console.log('———');

  startBot();
}

main();
