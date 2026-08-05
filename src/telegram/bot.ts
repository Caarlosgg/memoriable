import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from '../config/env.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';
import { InvalidMessageError } from '../pipeline/sanitize.js';
import { processMessage, type Pipeline } from '../pipeline/processMessage.js';
import { resolvePipeline } from '../pipeline/factory.js';
import { resolveChatOwner, linkTelegramChat } from '../db/users.js';
import { linkAttemptLimiter, type LinkAttemptLimiter } from './linkRateLimit.js';
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
  notLinked:
    '🔗 Todavía no he vinculado este chat a ninguna cuenta. Entra al dashboard, ve a "Cuenta" y mándame el código con <code>/vincular 123456</code>.',
  linkUsage: 'ℹ️ Escribe el código que te da el dashboard. Ejemplo: <code>/vincular 123456</code>',
  linkSuccess: '✅ ¡Chat vinculado! A partir de ahora, lo que me mandes se guarda en tu cuenta.',
  linkInvalid: '⚠️ Ese código no es válido o ha caducado. Genera uno nuevo desde "Cuenta" en el dashboard.',
  linkRateLimited:
    '⏳ Demasiados códigos incorrectos seguidos. Espera unos minutos y genera un código nuevo desde "Cuenta" en el dashboard.',
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
 * Menú de comandos que se publica en Telegram con `setMyCommands`, de modo que
 * aparezcan al escribir "/" en el chat (sin tocarlos a mano en @BotFather).
 */
export const BOT_COMMANDS = [
  { command: 'start', description: 'Empezar y ver cómo funciona el bot' },
  { command: 'vincular', description: 'Vincular este chat a tu cuenta del dashboard' },
  { command: 'buscar', description: 'Buscar en tus mensajes guardados' },
  { command: 'pendientes', description: 'Ver tus tareas y recordatorios pendientes' },
] as const;

/**
 * Publica el menú de comandos vía la API del bot. No es crítico: si falla (p.
 * ej. red), se registra un aviso pero el bot sigue funcionando. **Nunca lanza.**
 */
export async function registerCommands(
  bot: Pick<Telegraf, 'telegram'>,
  logger: Logger,
): Promise<void> {
  try {
    await bot.telegram.setMyCommands([...BOT_COMMANDS]);
    logger.info('telegram.commands_registered', { count: BOT_COMMANDS.length });
  } catch (err) {
    logger.warn('telegram.commands_register_failed', errorContext(err));
  }
}

/**
 * Maneja `/buscar <texto>`: busca coincidencias de texto y las devuelve como
 * tarjetas, las más recientes primero. **Nunca lanza**: ante un fallo interno
 * devuelve un mensaje de error y lo registra.
 */
export async function handleSearchCommand(
  query: string,
  userId: string,
  pipeline: Pipeline,
  logger: Logger | undefined = pipeline.logger,
): Promise<string> {
  const q = query.trim();
  if (q === '') return REPLIES.searchUsage;

  try {
    const results = await pipeline.repository.search(userId, q);
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
  userId: string,
  pipeline: Pipeline,
  logger: Logger | undefined = pipeline.logger,
): Promise<string> {
  try {
    const results = await pipeline.repository.pending(userId);
    return formatMessageList(results, {
      header: '📋 Tus pendientes (tareas y recordatorios):',
      empty: REPLIES.noPending,
    });
  } catch (err) {
    logger?.error('telegram.pending_failed', errorContext(err));
    return REPLIES.error;
  }
}

export interface TextMessageResult {
  /** Confirmación normal (tarjeta con categoría/resumen), siempre presente. */
  reply: string;
  /**
   * Pregunta de seguimiento (Fase 6), cuando el categorizador cree que
   * falta un dato importante (p. ej. la fecha de un recordatorio). NUNCA
   * sustituye ni retrasa la confirmación de arriba — el mensaje ya está
   * guardado con la mejor categoría posible pase lo que pase; esto es solo
   * un aviso aparte, a mayores.
   */
  followUp?: string;
}

/**
 * Lógica del handler de texto, aislada de Telegraf para poder testearla sin
 * salir a la red. **Nunca lanza**: siempre devuelve el texto que hay que
 * responder, de modo que un fallo interno no deja al usuario sin respuesta.
 */
export async function handleTextMessage(
  text: string,
  userId: string,
  pipeline: Pipeline,
  logger: Logger | undefined = pipeline.logger,
): Promise<TextMessageResult> {
  try {
    let followUp: string | undefined;
    const stored = await processMessage({ tipo: 'text', contenido: text }, userId, pipeline, (analysis) => {
      followUp = analysis.preguntaAclaratoria;
    });
    return { reply: formatResponseCard(stored), followUp };
  } catch (err) {
    if (err instanceof InvalidMessageError) return { reply: REPLIES.empty };
    logger?.error('telegram.handler_failed', errorContext(err));
    return { reply: REPLIES.error };
  }
}

/**
 * Maneja `/vincular <código>`: consume el código de un solo uso generado
 * desde el dashboard (sección "Cuenta") y liga este chat a esa cuenta.
 * **Nunca lanza**: ante un fallo interno devuelve un mensaje de error y lo
 * registra.
 *
 * Freno de fuerza bruta (ver `linkRateLimit.ts`): tras varios códigos
 * incorrectos seguidos desde el mismo chat, se deja de consultar la BD y se
 * responde directamente que hay que esperar. Los códigos correctos
 * (`no_database` incluido) no cuentan como fallo.
 */
export async function handleLinkCommand(
  code: string,
  chatId: number,
  linkChat: typeof linkTelegramChat = linkTelegramChat,
  logger?: Logger,
  limiter: LinkAttemptLimiter = linkAttemptLimiter,
): Promise<string> {
  const trimmed = code.trim();
  if (trimmed === '') return REPLIES.linkUsage;

  if (limiter.isBlocked(chatId)) return REPLIES.linkRateLimited;

  try {
    const result = await linkChat(trimmed, chatId);
    if (result === 'linked') {
      limiter.clear(chatId);
      return REPLIES.linkSuccess;
    }
    if (result === 'no_database') return REPLIES.error;
    limiter.registerFailure(chatId);
    return REPLIES.linkInvalid;
  } catch (err) {
    logger?.error('telegram.link_failed', errorContext(err));
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
    // Enlace de vínculo directo desde el dashboard (t.me/<bot>?start=<código>):
    // Telegram abre el chat y manda "/start <código>" solo, sin que el
    // usuario tenga que escribir /vincular a mano. `startPayload` es lo que
    // venga tras "/start " (deprecado por `ctx.payload` en Telegraf, pero
    // sigue funcionando y no requiere subir de versión para este caso).
    if (ctx.startPayload) {
      const reply = await handleLinkCommand(ctx.startPayload, ctx.chat.id, linkTelegramChat, logger);
      await ctx.reply(reply, { parse_mode: 'HTML' });
      return;
    }
    await ctx.reply(REPLIES.welcome);
  });

  // Resuelve el dueño del chat y responde algo útil en los dos caminos que,
  // sin esto, dejarían al usuario sin respuesta: chat no vinculado (pide
  // /vincular) y fallo al consultar la BD (aviso de reintento, en vez del
  // silencio de que el throw solo lo recoja bot.catch). Devuelve null si no
  // se debe seguir procesando. `reply` lo pasa el handler ya ligado a su ctx.
  const ownerFor = async (
    chatId: number,
    reply: (text: string) => Promise<unknown>,
  ): Promise<string | null> => {
    let userId: string | null;
    try {
      userId = await resolveChatOwner(chatId);
    } catch (err) {
      logger.error('telegram.resolve_owner_failed', errorContext(err));
      await reply(REPLIES.error);
      return null;
    }
    if (!userId) {
      await reply(REPLIES.notLinked);
      return null;
    }
    return userId;
  };

  bot.command('vincular', async (ctx) => {
    const reply = await handleLinkCommand(commandArgument(ctx.message.text), ctx.chat.id, linkTelegramChat, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  });

  bot.command('buscar', async (ctx) => {
    const userId = await ownerFor(ctx.chat.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const reply = await handleSearchCommand(commandArgument(ctx.message.text), userId, pipeline, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  });

  bot.command('pendientes', async (ctx) => {
    const userId = await ownerFor(ctx.chat.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const reply = await handlePendingCommand(userId, pipeline, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  });

  bot.on(message('text'), async (ctx) => {
    const userId = await ownerFor(ctx.chat.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const { reply, followUp } = await handleTextMessage(ctx.message.text, userId, pipeline, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
    // Aparte, nunca en vez de la confirmación de arriba (ver TextMessageResult).
    if (followUp) await ctx.reply(followUp);
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

  // Publica el menú de comandos (/buscar, /pendientes, ...) en Telegram.
  void registerCommands(bot, logger);

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
