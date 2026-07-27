import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from '../config/env.js';
import type { IncomingMessage } from '../ai/types.js';
import { processMessage, type Pipeline } from '../pipeline/processMessage.js';
import { resolvePipeline } from '../pipeline/factory.js';

/**
 * Lógica de negocio del handler de texto, aislada de Telegraf para poder
 * testearla sin salir a la red: procesa el mensaje y devuelve el texto de
 * respuesta ya formateado.
 */
export async function handleTextMessage(text: string, pipeline: Pipeline): Promise<string> {
  const incoming: IncomingMessage = { tipo: 'text', contenido: text };
  const stored = await processMessage(incoming, pipeline);
  return `🏷️ Categoría: ${stored.categoria}\n📝 Resumen: ${stored.resumen}`;
}

/**
 * Crea el bot de Telegraf y registra el handler de mensajes de texto.
 *
 * Devuelve `null` si falta el token: el módulo está escrito y listo, pero NO
 * bloquea al resto del sistema si `TELEGRAM_BOT_TOKEN` no está configurado.
 *
 * @param token   Token del bot (por defecto, el del entorno).
 * @param pipeline Colaboradores inyectables (categorizador + repositorio).
 */
export function createBot(
  token: string | undefined = env.TELEGRAM_BOT_TOKEN,
  pipeline: Pipeline = resolvePipeline(),
): Telegraf | null {
  if (!token) return null;

  const bot = new Telegraf(token);

  bot.start((ctx) =>
    ctx.reply('👋 Envíame un mensaje y lo categorizo y resumo por ti.'),
  );

  bot.on(message('text'), async (ctx) => {
    try {
      await ctx.reply(await handleTextMessage(ctx.message.text, pipeline));
    } catch (err) {
      console.error('Error procesando mensaje de Telegram:', err);
      await ctx.reply('⚠️ No he podido procesar tu mensaje. Inténtalo más tarde.');
    }
  });

  return bot;
}

/**
 * Arranca el bot en modo polling. Si falta el token, avisa y devuelve `null`
 * sin lanzar, para no tumbar el proceso.
 */
export function startBot(): Telegraf | null {
  const bot = createBot();
  if (!bot) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN no definido: el bot no arranca (el resto sí funciona).');
    return null;
  }

  bot.launch();
  console.log('✅ Bot de Telegram arrancado en modo polling.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}
