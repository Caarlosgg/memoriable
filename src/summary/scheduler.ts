import cron, { type ScheduledTask } from 'node-cron';
import type { Telegraf } from 'telegraf';
import { env } from '../config/env.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';
import type { MessageRepository } from '../db/repository.js';
import type { EventRepository } from '../db/eventRepository.js';
import { resolveChatOwner } from '../db/users.js';
import {
  runDailySummaryTick,
  type DailySummaryTickDeps,
} from './dailySummary.js';
import { DEFAULT_SUMMARY_STATE_FILE, FileSummaryStateStore } from './summaryState.js';
import type { FocusStateStore } from './focusState.js';
import type { BriefingGenerator } from '../ai/briefing.js';

export interface DailySummaryHandle {
  /** Detiene el cron (para apagados ordenados y tests). */
  stop(): void;
}

/**
 * Programa el resumen diario proactivo con node-cron.
 *
 * Devuelve `null` si falta `TELEGRAM_CHAT_ID`: el resto del bot sigue
 * funcionando (mismo principio de desacoplamiento que el resto del sistema).
 *
 * Robustez ante reinicios:
 * - el cron dispara a la hora configurada cada día,
 * - además se ejecuta un "tick" de puesta al día al arrancar, por si el proceso
 *   estaba caído a la hora prevista,
 * - la idempotencia (marca de día persistida en fichero) impide duplicar el
 *   envío del mismo día en cualquiera de los dos caminos.
 */
export function startDailySummary(
  bot: Telegraf,
  repository: MessageRepository,
  logger: Logger = rootLogger,
  /** Estado del "ritual matutino" (Tier 2.6): sin él, el resumen se manda igual pero no propone foco del día. */
  focusStore?: FocusStateStore,
  eventRepository?: EventRepository,
  /** Daily Briefing (Tier P1): sin él, el resumen es el de siempre, sin la sección de consultor. */
  briefingGenerator?: BriefingGenerator,
): DailySummaryHandle | null {
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    logger.warn('summary.disabled', {
      reason: 'TELEGRAM_CHAT_ID no definido',
      action: 'el resumen diario no se programa; el resto del bot sigue activo',
      hint: 'Escribe al bot y consulta getUpdates, o usa @userinfobot, para obtener tu chat id.',
    });
    return null;
  }

  const hour = env.DAILY_SUMMARY_HOUR;
  const store = new FileSummaryStateStore(
    env.DAILY_SUMMARY_STATE_FILE ?? DEFAULT_SUMMARY_STATE_FILE,
    (err) => logger.warn('summary.state_store_error', errorContext(err)),
  );

  const baseDeps: Omit<DailySummaryTickDeps, 'userId'> = {
    repository,
    store,
    chatId: Number(chatId),
    focusStore,
    eventRepository,
    briefingGenerator,
    hour,
    logger,
    send: (text) => bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' }).then(() => {}),
  };

  // Se resuelve en cada tick (no una vez al arrancar): así, si el chat se
  // vincula a una cuenta después de que el bot ya esté corriendo, el
  // resumen empieza a mandarse sin reiniciar el proceso.
  const tick = () =>
    resolveChatOwner(Number(chatId))
      .then((userId) => {
        if (!userId) {
          logger.warn('summary.chat_not_linked', {
            chatId,
            hint: 'Vincula este chat a una cuenta desde /cuenta en el dashboard (envía /vincular <código>).',
          });
          return;
        }
        return runDailySummaryTick({ ...baseDeps, userId });
      })
      .catch((err) => logger.error('summary.tick_failed', errorContext(err)));

  logger.info('summary.scheduled', { hour, chatId });

  // Puesta al día al arrancar (por si el proceso estaba caído a la hora).
  void tick();

  // Disparo diario a la hora en punto configurada (hora local del servidor).
  const task: ScheduledTask = cron.schedule(`0 ${hour} * * *`, () => void tick());

  return { stop: () => task.stop() };
}
