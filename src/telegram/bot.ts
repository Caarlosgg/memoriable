import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from '../config/env.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';
import { InvalidMessageError } from '../pipeline/sanitize.js';
import { processMessage, type Pipeline } from '../pipeline/processMessage.js';
import { resolvePipeline } from '../pipeline/factory.js';
import { describeTelegramError, isValidTokenFormat } from './errors.js';
import { formatResponseCard, escapeHtml } from './formatResponseCard.js';
import { formatMessageList } from './formatList.js';
import { startDailySummary } from '../summary/scheduler.js';

/** Respuestas al usuario, centralizadas para poder testearlas. */
export const REPLIES = {
  welcome: '👋 Envíame un mensaje y lo categorizo y resumo por ti.',
  empty: '🤔 No he recibido texto que analizar. Escríbeme algo y lo clasifico.',
  error: '⚠️ No he podido procesar tu mensaje. Inténtalo de nuevo en un momento.',
  searchUsage: 'ℹ️ Escribe qué quieres buscar. Ejemplo: <code>/buscar factura luz</code>',
  noPending: '✅ No tienes nada pendiente. ¡Todo al día!',
} as const;

/**
 * Extrae el argumento de un comando a partir del texto completo del mensaje,
 * quitando el propio token del comando (`/buscar`, `/buscar@mibot`). Devuelve el
 * resto ya recortado.
 */
export function commandArgument(text: string): string {
  return text.replace(/^\/\S+\s*/, '').trim();
}

/**
 * Maneja `/buscar <texto>`: busca coincidencias de texto y las devuelve como
 * tarjetas, las más recientes primero. **Nunca lanza**: ante un fallo interno
 * devuelve un mensaje de error y lo registra.
 */
export async function handleSearchCommand(
  query: string,
  pipeline: Pipeline,
  logger: Logger | undefined = pipeline.logger,
): Promise<string> {
  const q = query.trim();
  if (q === '') return REPLIES.searchUsage;

  try {
    const results = await pipeline.repository.search(q);
    return formatMessageList(results, {
      header: `🔎 Resultados para «${escapeHtml(q)}»:`,
      empty: `🔍 No he encontrado nada que coincida con «${escapeHtml(q)}». Prueba con otra palabra.`,
    });
  } catch (err) {
    logger?.error('telegram.search_failed', errorContext(err));
    return REPLIES.error;
  }
}

/**
 * Maneja `/pendientes`: lista las tareas/recordatorios sin marcar como hechos,
 * las más recientes primero, como tarjetas. **Nunca lanza**: ante un fallo
 * interno devuelve un mensaje de error y lo registra.
 */
export async function handlePendingCommand(
  pipeline: Pipeline,
  logger: Logger | undefined = pipeline.logger,
): Promise<string> {
  try {
    const results = await pipeline.repository.pending();
    return formatMessageList(results, {
      header: '📋 Tus pendientes (tareas y recordatorios):',
      empty: REPLIES.noPending,
    });
  } catch (err) {
    logger?.error('telegram.pending_failed', errorContext(err));
    return REPLIES.error;
  }
}

/**
 * Lógica del handler de texto, aislada de Telegraf para poder testearla sin
 * salir a la red. **Nunca lanza**: siempre devuelve el texto que hay que
 * responder, de modo que un fallo interno no deja al usuario sin respuesta.
 */
export async function handleTextMessage(
  text: string,
  pipeline: Pipeline,
  logger: Logger | undefined = pipeline.logger,
): Promise<string> {
  try {
    const stored = await processMessage({ tipo: 'text', contenido: text }, pipeline);
    return formatResponseCard(stored);
  } catch (err) {
    if (err instanceof InvalidMessageError) return REPLIES.empty;
    logger?.error('telegram.handler_failed', errorContext(err));
    return REPLIES.error;
  }
}

/**
 * Crea el bot de Telegraf y registra los handlers.
 *
 * Devuelve `null` si falta el token: el módulo está escrito y listo, pero NO
 * bloquea al resto del sistema si `TELEGRAM_BOT_TOKEN` no está configurado.
 */
export function createBot(
  token: string | undefined = env.TELEGRAM_BOT_TOKEN,
  pipeline: Pipeline = resolvePipeline(),
  logger: Logger = pipeline.logger ?? rootLogger,
): Telegraf | null {
  if (!token) return null;

  if (!isValidTokenFormat(token)) {
    // No abortamos: puede ser un token de prueba. Pero avisamos claramente,
    // porque el síntoma real llegaría luego como un 401 opaco.
    logger.warn('telegram.token_format_suspicious', {
      hint: 'El token no tiene el formato 123456789:AA... de @BotFather. Revisa TELEGRAM_BOT_TOKEN.',
    });
  }

  const bot = new Telegraf(token, { handlerTimeout: 60_000 });

  bot.start(async (ctx) => {
    await ctx.reply(REPLIES.welcome);
  });

  bot.command('buscar', async (ctx) => {
    const reply = await handleSearchCommand(commandArgument(ctx.message.text), pipeline, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  });

  bot.command('pendientes', async (ctx) => {
    const reply = await handlePendingCommand(pipeline, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  });

  bot.on(message('text'), async (ctx) => {
    const reply = await handleTextMessage(ctx.message.text, pipeline, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  });

  // Red de seguridad: cualquier error no capturado en un handler (incluido un
  // fallo al responder) se registra en vez de propagarse y tumbar el polling.
  bot.catch((err, ctx) => {
    const info = describeTelegramError(err);
    logger.error(info.event, {
      hint: info.hint,
      updateType: ctx?.updateType,
      ...errorContext(err),
    });
  });

  return bot;
}

export interface LaunchOptions {
  /** Reintentos de arranque/reconexión. Por defecto ilimitados (proceso residente). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

export type LaunchOutcome = 'stopped' | 'fatal' | 'exhausted';

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

/**
 * Arranca el polling y lo vuelve a levantar si se cae, con backoff exponencial
 * acotado.
 *
 * `launch` se inyecta para poder testear la reconexión sin red. Devuelve:
 * - `stopped`: el polling terminó de forma limpia (parada ordenada),
 * - `fatal`: error que no se arregla reintentando (p. ej. token inválido),
 * - `exhausted`: se agotaron los reintentos configurados.
 */
export async function launchWithRetry(
  launch: () => Promise<void>,
  options: LaunchOptions = {},
): Promise<LaunchOutcome> {
  const {
    retries = Number.POSITIVE_INFINITY,
    baseDelayMs = 1_000,
    maxDelayMs = 60_000,
    sleep = defaultSleep,
    logger,
  } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      await launch();
      logger?.info('telegram.polling_stopped', { attempt });
      return 'stopped';
    } catch (err) {
      const info = describeTelegramError(err);
      logger?.error(info.event, { attempt, hint: info.hint, ...errorContext(err) });

      if (info.fatal) {
        logger?.error('telegram.launch_aborted', {
          reason: 'error no recuperable; el bot no se reintenta',
          hint: info.hint,
        });
        return 'fatal';
      }

      if (attempt >= retries) {
        logger?.error('telegram.launch_exhausted', { attempts: attempt + 1 });
        return 'exhausted';
      }

      const delayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      logger?.warn('telegram.reconnecting', { attempt, delayMs });
      await sleep(delayMs);
    }
  }
}

/**
 * Arranca el bot en modo polling con reconexión automática. Si falta el token,
 * avisa y devuelve `null` sin lanzar, para no tumbar el proceso.
 */
export function startBot(
  pipeline: Pipeline = resolvePipeline(),
  logger: Logger = pipeline.logger ?? rootLogger,
): Telegraf | null {
  const bot = createBot(env.TELEGRAM_BOT_TOKEN, pipeline, logger);

  if (!bot) {
    logger.warn('telegram.disabled', {
      reason: 'TELEGRAM_BOT_TOKEN no definido',
      action: 'el bot no arranca; el resto del sistema sigue funcionando',
      hint: 'Consigue el token con @BotFather y añádelo a .env para activarlo.',
    });
    return null;
  }

  logger.info('telegram.starting', { mode: 'polling' });

  // No se espera la promesa a propósito: el polling es un proceso de fondo.
  void launchWithRetry(() => bot.launch(), { logger }).then((outcome) => {
    if (outcome !== 'stopped') process.exitCode = 1;
  });

  // Resumen diario proactivo (si hay TELEGRAM_CHAT_ID configurado).
  const dailySummary = startDailySummary(bot, pipeline.repository, logger);

  const stop = (signal: string) => {
    logger.info('telegram.stopping', { signal });
    dailySummary?.stop();
    bot.stop(signal);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  return bot;
}
