import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from '../config/env.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';
import { InvalidMessageError } from '../pipeline/sanitize.js';
import { processMessage, type Pipeline } from '../pipeline/processMessage.js';
import { resolvePipeline, resolveBriefingGenerator } from '../pipeline/factory.js';
import { resolveChatOwner, linkTelegramChat } from '../db/users.js';
import { listCustomCategories, findCustomCategory } from '../db/customCategories.js';
import { listBotWorkspaces, resolveBotWorkspace, setBotWorkspace } from '../db/workspaces.js';
import type { StoredMessage } from '../db/repository.js';
import { linkAttemptLimiter, type LinkAttemptLimiter } from './linkRateLimit.js';
import { describeTelegramError, isValidTokenFormat } from './errors.js';
import { formatResponseCard, escapeHtml } from './formatResponseCard.js';
import { formatMessageList } from './formatList.js';
import {
  noteActionsKeyboard,
  categoryPickerKeyboard,
  workspacePickerKeyboard,
  snoozePickerKeyboard,
  confirmDeleteKeyboard,
} from './actionsKeyboard.js';
import { isCategory, type Category } from '../ai/types.js';
import { startDailySummary } from '../summary/scheduler.js';
import { dayKey, buildDailySummary } from '../summary/dailySummary.js';
import { FileFocusStateStore, type FocusStateStore } from '../summary/focusState.js';
import { PrismaEventRepository, type EventRepository } from '../db/eventRepository.js';
import type { BriefingGenerator } from '../ai/briefing.js';
import { resolveTranscriber } from '../pipeline/factory.js';
import type { Transcriber } from '../ai/transcriber.js';

/** Respuestas al usuario, centralizadas para poder testearlas. */
export const REPLIES = {
  welcome: '👋 Envíame un mensaje y lo categorizo y resumo por ti.',
  empty: '🤔 No he recibido texto que analizar. Escríbeme algo y lo clasifico.',
  error: '⚠️ No he podido procesar tu mensaje. Inténtalo de nuevo en un momento.',
  voiceFailed:
    '🎙️ No he podido entender el audio. Prueba a mandarlo otra vez, o escríbeme el mensaje directamente.',
  searchUsage: 'ℹ️ Escribe qué quieres buscar. Ejemplo: <code>/buscar factura luz</code>',
  noPending: '✅ No tienes nada pendiente. ¡Todo al día!',
  notLinked:
    '🔗 Todavía no he vinculado este chat a ninguna cuenta. Entra al dashboard, ve a "Cuenta" y mándame el código con <code>/vincular 123456</code>.',
  linkUsage: 'ℹ️ Escribe el código que te da el dashboard. Ejemplo: <code>/vincular 123456</code>',
  linkSuccess: '✅ ¡Chat vinculado! A partir de ahora, lo que me mandes se guarda en tu cuenta.',
  linkInvalid: '⚠️ Ese código no es válido o ha caducado. Genera uno nuevo desde "Cuenta" en el dashboard.',
  linkRateLimited:
    '⏳ Demasiados códigos incorrectos seguidos. Espera unos minutos y genera un código nuevo desde "Cuenta" en el dashboard.',
  espacioSolo:
    '🔒 Solo tienes tu espacio personal, así que todo lo que me mandes se guarda ahí. Crea un equipo en el dashboard y podrás elegir.',
  espacioNoMiembro: '⚠️ Ya no perteneces a ese equipo. Sigo escribiendo en tu espacio personal.',
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
  { command: 'espacio', description: 'Elegir dónde guardo lo que me mandas (personal o equipo)' },
  { command: 'buscar', description: 'Buscar en tus mensajes guardados' },
  { command: 'pendientes', description: 'Ver tus tareas y recordatorios pendientes' },
  { command: 'resumen', description: 'Tu día en claro: misión principal, plan y avisos' },
  { command: 'hoy', description: 'Igual que /resumen' },
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

/** Cuántos resultados devuelve `/buscar` como mucho. */
const SEARCH_LIMIT = 5;

/**
 * Búsqueda híbrida para `/buscar`: coincidencia literal primero, similitud
 * por significado para rellenar.
 *
 * Antes esto era `ILIKE` puro y la web sí buscaba por significado, así que
 * "lo del fontanero" no encontraba desde Telegram "llamar al del agua" que sí
 * salía en el dashboard. Que la MISMA búsqueda diera resultados distintos
 * según por dónde entraras era el problema, más que la calidad de cada mitad.
 *
 * El texto va siempre primero y en su orden: una coincidencia literal es una
 * certeza, y lo semántico es una conjetura — nunca debe desplazarla. Sin
 * `embedder` (falta GEMINI_API_KEY) o si Gemini falla, se queda solo con el
 * texto: exactamente el comportamiento de antes, nunca un error.
 */
async function buscarHibrido(
  query: string,
  userId: string,
  pipeline: Pipeline,
  logger?: Logger,
): Promise<StoredMessage[]> {
  const textuales = await pipeline.repository.search(userId, query, SEARCH_LIMIT);
  if (textuales.length >= SEARCH_LIMIT || !pipeline.embedder) return textuales;

  let vector: number[] | null = null;
  try {
    vector = await pipeline.embedder.embedQuery(query);
  } catch (err) {
    // No crítico: los resultados de texto ya están y valen.
    logger?.warn('telegram.search_embedding_failed', errorContext(err));
  }
  if (!vector) return textuales;

  const vistos = new Set(textuales.map((m) => m.id));
  const semanticos = await pipeline.repository
    .searchSimilar(userId, vector, SEARCH_LIMIT)
    .catch((err) => {
      logger?.warn('telegram.search_semantic_failed', errorContext(err));
      return [] as StoredMessage[];
    });

  return [...textuales, ...semanticos.filter((m) => !vistos.has(m.id))].slice(0, SEARCH_LIMIT);
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
    const results = await buscarHibrido(q, userId, pipeline, logger);
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

/**
 * Traduce el plazo de un botón de aplazar a una fecha límite concreta.
 *
 * `'x'` significa quitar la fecha (`null`), que no es lo mismo que un plazo
 * inválido (`undefined`) — de ahí los tres valores posibles: aplazar
 * indefinidamente es una opción legítima, y confundirla con un error dejaría
 * al usuario sin salida de una tarea con fecha salvo darla por hecha o
 * borrarla.
 *
 * La fecha se fija al FINAL del día elegido: una tarea "para mañana" no
 * vence a las 00:00 de mañana, vence cuando acaba mañana.
 */
export function plazoAFecha(plazo: string, ahora: Date = new Date()): Date | null | undefined {
  if (plazo === 'x') return null;
  // `/^\d+$/` y no `Number(plazo)` a secas: `Number('')` es 0, y ' 2 ' es 2 —
  // los dos colarían como plazos válidos donde solo debe entrar un número
  // de días escrito tal cual por nuestros propios botones.
  if (!/^\d+$/.test(plazo)) return undefined;
  const dias = Number(plazo);
  if (dias > 365) return undefined;

  const fecha = new Date(ahora);
  fecha.setDate(fecha.getDate() + dias);
  fecha.setHours(23, 59, 59, 999);
  return fecha;
}

export interface EspacioCommandResult {
  text: string;
  /** Teclado con los espacios elegibles — ausente si no hay nada que elegir. */
  keyboard?: ReturnType<typeof workspacePickerKeyboard>;
}

/**
 * Maneja `/espacio`: enseña dónde está escribiendo el bot ahora mismo y
 * ofrece cambiarlo.
 *
 * Es el comando que arregla la incoherencia más gorda que tenía el producto:
 * el bot guardaba SIEMPRE en el espacio personal, así que quien trabajaba en
 * equipo dictaba notas al bot y su equipo no las veía nunca.
 *
 * Si solo hay espacio personal no se enseña un selector de un botón —
 * pedirle a alguien que "elija" entre una única opción es teatro; se le dice
 * lo que hay y cómo tener más. **Nunca lanza.**
 */
export async function handleEspacioCommand(
  userId: string,
  logger?: Logger,
  listar: typeof listBotWorkspaces = listBotWorkspaces,
  resolver: typeof resolveBotWorkspace = resolveBotWorkspace,
): Promise<EspacioCommandResult> {
  try {
    const [espacios, actual] = await Promise.all([listar(userId), resolver(userId)]);
    if (espacios.length <= 1) return { text: REPLIES.espacioSolo };

    return {
      text: `📍 Ahora mismo guardo en <b>${escapeHtml(actual.nombre)}</b>.\nElige dónde quieres que guarde a partir de ahora:`,
      keyboard: workspacePickerKeyboard(espacios, actual.id),
    };
  } catch (err) {
    logger?.error('telegram.espacio_failed', errorContext(err));
    return { text: REPLIES.error };
  }
}

/**
 * Aplica la elección de `/espacio` (callback `ws:<id>`). Devuelve el texto de
 * confirmación; la comprobación de que sigues siendo miembro ACTIVO la hace
 * `setBotWorkspace` en el `where`, no aquí — el id llega por `callback_data`,
 * que es entrada de usuario. **Nunca lanza.**
 */
export async function handleEspacioChoice(
  userId: string,
  workspaceId: string,
  logger?: Logger,
  fijar: typeof setBotWorkspace = setBotWorkspace,
  resolver: typeof resolveBotWorkspace = resolveBotWorkspace,
): Promise<string> {
  try {
    const result = await fijar(userId, workspaceId);
    if (result === 'no_member') return REPLIES.espacioNoMiembro;
    if (result === 'no_database') return REPLIES.error;

    const actual = await resolver(userId);
    return `✅ A partir de ahora guardo en <b>${escapeHtml(actual.nombre)}</b>.`;
  } catch (err) {
    logger?.error('telegram.espacio_choice_failed', errorContext(err));
    return REPLIES.error;
  }
}

/** Teclado inline bajo el Daily Briefing: mismo par de acciones en /resumen, /hoy y "Actualizar". */
export function briefingKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback('🔁 Actualizar', 'briefing:refresh'),
    Markup.button.callback('📋 Ver pendientes', 'briefing:pendientes'),
  ]);
}

/**
 * Maneja `/resumen` y `/hoy`: el Daily Briefing bajo demanda (Tier P1) —
 * mismo contenido que el resumen programado, pero sin la comprobación de
 * "una vez al día" (aquí el usuario lo está pidiendo expresamente, tantas
 * veces como quiera). **Nunca lanza**: ante un fallo interno devuelve un
 * mensaje de error y lo registra.
 */
export async function handleBriefingCommand(
  userId: string,
  pipeline: Pipeline,
  eventRepository: EventRepository | undefined,
  briefingGenerator: BriefingGenerator | undefined,
  logger: Logger | undefined = pipeline.logger,
): Promise<string> {
  try {
    const { text } = await buildDailySummary(pipeline.repository, userId, new Date(), eventRepository, briefingGenerator);
    return text;
  } catch (err) {
    logger?.error('telegram.briefing_failed', errorContext(err));
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
  /**
   * La nota recién guardada, solo lo justo para construir los botones
   * inline (Fase 3 del roadmap) bajo la tarjeta — `undefined` si el
   * guardado falló y `reply` es un mensaje de error, que no lleva botones.
   */
  saved?: { id: string; categoria: Category; hecho: boolean };
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
    return {
      reply: formatResponseCard(stored),
      followUp,
      saved: { id: stored.id, categoria: stored.categoria, hecho: stored.hecho },
    };
  } catch (err) {
    if (err instanceof InvalidMessageError) return { reply: REPLIES.empty };
    logger?.error('telegram.handler_failed', errorContext(err));
    return { reply: REPLIES.error };
  }
}

/**
 * Lógica del handler de notas de voz: transcribe con `transcriber` y, si
 * sale texto, sigue el MISMO camino que un mensaje escrito
 * (`handleTextMessage`) — categorización, resumen y guardado no distinguen
 * si el texto vino de teclado o de voz. **Nunca lanza**: sin transcripción
 * (falta GROQ_API_KEY, o Groq falla), responde con un aviso claro en vez de
 * dejar al usuario sin respuesta.
 */
export async function handleVoiceMessage(
  audioUrl: string,
  userId: string,
  pipeline: Pipeline,
  transcriber: Transcriber,
  logger: Logger | undefined = pipeline.logger,
): Promise<TextMessageResult> {
  const text = await transcriber.transcribe(audioUrl);
  if (!text) return { reply: REPLIES.voiceFailed };
  return handleTextMessage(text, userId, pipeline, logger);
}

/**
 * Si el chat está esperando la respuesta del "foco del día" (Tier 2.6,
 * ritual matutino) y el mensaje llega el MISMO día en que se propuso, lo
 * consume como esa respuesta — no se guarda como una nota nueva — y
 * devuelve el texto de confirmación. `null` si no aplica: el llamante debe
 * seguir con el flujo normal de captura (`handleTextMessage`).
 *
 * Pura salvo por `focusStore` (inyectado, mismo criterio que el resto del
 * bot): comprobable sin Telegraf ni reloj real.
 */
export function tryAnswerFocus(
  focusStore: FocusStateStore | undefined,
  chatId: number,
  text: string,
  now: Date = new Date(),
): string | null {
  if (!focusStore) return null;
  const state = focusStore.get(chatId);
  if (!state || !state.awaitingAnswer || state.day !== dayKey(now)) return null;

  const trimmed = text.trim();
  if (trimmed === '') return null;

  focusStore.setAnswer(chatId, state.day, trimmed);
  return `📌 Foco de hoy: <b>${escapeHtml(trimmed)}</b>. ¡A por ello!`;
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
  /** Estado del "ritual matutino" (Tier 2.6) — sin él, el bot funciona igual pero no hay foco del día. */
  focusStore?: FocusStateStore,
  /** Daily Briefing (Tier P1) — sin estos dos, /resumen y /hoy siguen funcionando, solo sin eventos ni consultor de IA. */
  eventRepository?: EventRepository,
  briefingGenerator?: BriefingGenerator,
  /** Transcripción de notas de voz — sin GROQ_API_KEY, NullTranscriber hace que se avise con REPLIES.voiceFailed en vez de fallar en silencio. */
  transcriber: Transcriber = resolveTranscriber(logger),
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

  bot.command('espacio', async (ctx) => {
    const userId = await ownerFor(ctx.chat.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const { text, keyboard } = await handleEspacioCommand(userId, logger);
    await ctx.reply(text, { parse_mode: 'HTML', ...(keyboard ?? {}) });
  });

  bot.action(/^ws:(.+)$/, async (ctx) => {
    const workspaceId = ctx.match[1]!;
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    const text = await handleEspacioChoice(userId, workspaceId, logger);
    await ctx.answerCbQuery();
    try {
      // Se edita el mensaje del selector en vez de mandar uno nuevo: el
      // selector ya no sirve de nada una vez elegido, y dejarlo ahí invita
      // a pulsar botones que ya no reflejan el estado.
      await ctx.editMessageText(text, { parse_mode: 'HTML' });
    } catch (err) {
      logger.debug('telegram.espacio_edit_noop', errorContext(err));
    }
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

  // /resumen y /hoy: el mismo Daily Briefing bajo demanda (Tier P1).
  bot.command(['resumen', 'hoy'], async (ctx) => {
    const userId = await ownerFor(ctx.chat.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const reply = await handleBriefingCommand(userId, pipeline, eventRepository, briefingGenerator, logger);
    await ctx.reply(reply, { parse_mode: 'HTML', ...briefingKeyboard() });
  });

  bot.action('briefing:refresh', async (ctx) => {
    await ctx.answerCbQuery('Actualizando…');
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const reply = await handleBriefingCommand(userId, pipeline, eventRepository, briefingGenerator, logger);
    try {
      await ctx.editMessageText(reply, { parse_mode: 'HTML', ...briefingKeyboard() });
    } catch (err) {
      // Si el texto es idéntico al anterior, Telegram rechaza la edición
      // ("message is not modified") — no es un fallo real, no hace falta
      // registrarlo como error.
      logger.debug('telegram.briefing_refresh_noop', errorContext(err));
    }
  });

  bot.action('briefing:pendientes', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const reply = await handlePendingCommand(userId, pipeline, logger);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  });

  bot.on(message('text'), async (ctx) => {
    // Ritual matutino (Tier 2.6): si este chat está esperando la respuesta
    // del foco del día y llega HOY, se consume aquí — nunca llega a
    // guardarse como una nota nueva. Antes de `ownerFor` a propósito: si el
    // resumen ya se mandó a este chat, es porque ya estaba vinculado.
    const focusReply = tryAnswerFocus(focusStore, ctx.chat.id, ctx.message.text);
    if (focusReply) {
      await ctx.reply(focusReply, { parse_mode: 'HTML' });
      return;
    }

    const userId = await ownerFor(ctx.chat.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;
    const { reply, followUp, saved } = await handleTextMessage(ctx.message.text, userId, pipeline, logger);
    // Botones inline (Fase 3 del roadmap) solo si de verdad se guardó algo
    // — un mensaje de error no lleva "Hecho"/"Recategorizar" sobre nada.
    await ctx.reply(reply, { parse_mode: 'HTML', ...(saved ? noteActionsKeyboard(saved) : {}) });
    // Aparte, nunca en vez de la confirmación de arriba (ver TextMessageResult).
    if (followUp) await ctx.reply(followUp);
  });

  // Notas de voz: se transcriben (ver handleVoiceMessage) y siguen el MISMO
  // camino que un mensaje de texto — sin ritual del foco del día por voz a
  // propósito (mismo criterio simple que el resto: una nota de voz es una
  // captura nueva, no se espera que responda a una pregunta del bot).
  bot.on(message('voice'), async (ctx) => {
    const userId = await ownerFor(ctx.chat.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) return;

    let audioUrl: string;
    try {
      const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      audioUrl = link.toString();
    } catch (err) {
      logger.error('telegram.voice_link_failed', errorContext(err));
      await ctx.reply(REPLIES.voiceFailed);
      return;
    }

    const { reply, followUp, saved } = await handleVoiceMessage(audioUrl, userId, pipeline, transcriber, logger);
    await ctx.reply(reply, { parse_mode: 'HTML', ...(saved ? noteActionsKeyboard(saved) : {}) });
    if (followUp) await ctx.reply(followUp);
  });

  // Botones inline bajo la tarjeta de confirmación (Fase 3 del roadmap).
  // El id de la nota va en `callback_data` (ver actionsKeyboard.ts) — se
  // extrae con una regex en vez de parsear a mano en cada handler.

  /**
   * Repinta la tarjeta tras done/setcat/setcustom: resuelve la etiqueta
   * propia si la nota tiene una (para la línea extra de la tarjeta, ver
   * formatResponseCard) y edita texto + teclado en el sitio. Un único
   * punto para los tres handlers, en vez de repetir el try/catch y la
   * resolución de la etiqueta en cada uno.
   */
  async function refreshCard(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Telegraf tipa `extra` de editMessageText con un objeto muy específico por update; lo relevante aquí es que exista el método, no su forma exacta.
    ctx: { editMessageText: (text: string, extra?: any) => Promise<unknown> },
    userId: string,
    updated: StoredMessage,
  ) {
    const categoriaPersonalizada = updated.customCategoryId
      ? ((await findCustomCategory(userId, updated.customCategoryId)) ?? undefined)
      : undefined;
    try {
      await ctx.editMessageText(formatResponseCard({ ...updated, categoriaPersonalizada }), {
        parse_mode: 'HTML',
        ...noteActionsKeyboard(updated),
      });
    } catch (err) {
      // "message is not modified" si se pulsa dos veces seguidas — no es un
      // fallo real (mismo criterio que briefing:refresh, más arriba).
      logger.debug('telegram.card_refresh_noop', errorContext(err));
    }
  }

  bot.action(/^done:(.+)$/, async (ctx) => {
    const messageId = ctx.match[1]!;
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    const updated = await pipeline.repository.markDone(userId, messageId);
    if (!updated) {
      await ctx.answerCbQuery('Esa nota ya no existe.');
      return;
    }
    await ctx.answerCbQuery('Marcada como hecha ✅');
    await refreshCard(ctx, userId, updated);
  });

  bot.action(/^snooze:(.+)$/, async (ctx) => {
    const messageId = ctx.match[1]!;
    await ctx.answerCbQuery();
    // Solo cambia el TECLADO: la tarjeta sigue siendo válida, lo único que
    // pasa es que ahora ofrece los plazos (mismo criterio que `cat:`).
    try {
      await ctx.editMessageReplyMarkup(snoozePickerKeyboard(messageId).reply_markup);
    } catch (err) {
      logger.debug('telegram.snooze_picker_noop', errorContext(err));
    }
  });

  bot.action(/^snz:([^:]+):(.+)$/, async (ctx) => {
    const [, messageId, plazo] = ctx.match;
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    const fechaLimite = plazoAFecha(plazo!);
    if (fechaLimite === undefined) {
      await ctx.answerCbQuery('Plazo no válido.');
      return;
    }
    const updated = await pipeline.repository.postpone(userId, messageId!, fechaLimite);
    if (!updated) {
      await ctx.answerCbQuery('Esa nota ya no existe.');
      return;
    }
    await ctx.answerCbQuery(fechaLimite ? 'Aplazada ⏰' : 'Fecha quitada');
    await refreshCard(ctx, userId, updated);
  });

  bot.action(/^del:(.+)$/, async (ctx) => {
    const messageId = ctx.match[1]!;
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageReplyMarkup(confirmDeleteKeyboard(messageId).reply_markup);
    } catch (err) {
      logger.debug('telegram.delete_confirm_noop', errorContext(err));
    }
  });

  bot.action(/^delno:(.+)$/, async (ctx) => {
    const messageId = ctx.match[1]!;
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    await ctx.answerCbQuery();
    // Se relee la nota en vez de reconstruir el teclado a ojo: "✅ Hecho" y
    // "⏰ Aplazar" solo salen si sigue pendiente, y eso puede haber cambiado
    // (desde el dashboard, u otro dispositivo) mientras el selector estaba
    // abierto. Devolver botones que no corresponden sería peor que no
    // devolver ninguno.
    const nota = await pipeline.repository.findById(userId, messageId);
    if (!nota) {
      await ctx.editMessageText('🗑 <i>Esa nota ya no existe.</i>', { parse_mode: 'HTML' }).catch(() => {});
      return;
    }
    try {
      await ctx.editMessageReplyMarkup(noteActionsKeyboard(nota).reply_markup);
    } catch (err) {
      logger.debug('telegram.delete_cancel_noop', errorContext(err));
    }
  });

  bot.action(/^delsi:(.+)$/, async (ctx) => {
    const messageId = ctx.match[1]!;
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    const borrada = await pipeline.repository.remove(userId, messageId);
    if (!borrada) {
      await ctx.answerCbQuery('Esa nota ya no existe.');
      return;
    }
    await ctx.answerCbQuery('Borrada 🗑');
    try {
      // Se tacha la tarjeta y se le quita el teclado: dejarla intacta con
      // botones sobre algo que ya no existe sería mentir.
      await ctx.editMessageText('🗑 <i>Nota borrada.</i>', { parse_mode: 'HTML' });
    } catch (err) {
      logger.debug('telegram.delete_edit_noop', errorContext(err));
    }
  });

  bot.action(/^cat:(.+)$/, async (ctx) => {
    const messageId = ctx.match[1]!;
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    await ctx.answerCbQuery();
    // Solo cambia el TECLADO (no el texto de la tarjeta): no hace falta
    // volver a leer la nota, solo la lista de categorías propias del
    // usuario para añadirlas al selector junto a las 6 fijas.
    const propias = await listCustomCategories(userId);
    try {
      await ctx.editMessageReplyMarkup(categoryPickerKeyboard(messageId, propias).reply_markup);
    } catch (err) {
      logger.debug('telegram.category_picker_noop', errorContext(err));
    }
  });

  bot.action(/^setcat:([^:]+):(.+)$/, async (ctx) => {
    const [, messageId, categoriaRaw] = ctx.match;
    if (!isCategory(categoriaRaw)) {
      await ctx.answerCbQuery('Categoría no válida.');
      return;
    }
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    const updated = await pipeline.repository.recategorize(userId, messageId!, categoriaRaw);
    if (!updated) {
      await ctx.answerCbQuery('Esa nota ya no existe.');
      return;
    }
    await ctx.answerCbQuery('Categoría actualizada 🏷️');
    await refreshCard(ctx, userId, updated);
  });

  // Categoría PROPIA (Fase 3 del roadmap): pone `customCategoryId` APARTE
  // de `categoria` — ver categoryPickerKeyboard sobre por qué es una ruta
  // de callback distinta a `setcat:`, no la misma con otro formato.
  bot.action(/^setcustom:([^:]+):(.+)$/, async (ctx) => {
    const [, messageId, customCategoryId] = ctx.match;
    const userId = await ownerFor(ctx.chat!.id, (t) => ctx.reply(t, { parse_mode: 'HTML' }));
    if (!userId) {
      await ctx.answerCbQuery();
      return;
    }
    const updated = await pipeline.repository.setCustomCategory(userId, messageId!, customCategoryId!);
    if (!updated) {
      await ctx.answerCbQuery('Esa nota o esa categoría ya no existen.');
      return;
    }
    await ctx.answerCbQuery('Categoría actualizada 🏷️');
    await refreshCard(ctx, userId, updated);
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
  // Un único store para todo el proceso: lo consultan tanto el disparo del
  // resumen (marca "esperando respuesta") como el handler de texto general
  // (consume esa marca). Ver summary/focusState.ts.
  const focusStore = new FileFocusStateStore(undefined, (err) =>
    logger.warn('summary.focus_store_error', errorContext(err)),
  );
  // Compartidos entre /resumen, /hoy y el cron: un único EventRepository y
  // un único generador del Daily Briefing (con su propio fusible de coste)
  // para todo el proceso.
  const eventRepository = new PrismaEventRepository();
  const briefingGenerator = resolveBriefingGenerator(logger);
  const bot = createBot(env.TELEGRAM_BOT_TOKEN, pipeline, logger, focusStore, eventRepository, briefingGenerator);

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
  const dailySummary = startDailySummary(bot, pipeline.repository, logger, focusStore, eventRepository, briefingGenerator);

  const stop = (signal: string) => {
    logger.info('telegram.stopping', { signal });
    dailySummary?.stop();
    bot.stop(signal);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  return bot;
}
