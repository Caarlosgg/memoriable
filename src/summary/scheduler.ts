import cron, { type ScheduledTask } from 'node-cron';
import type { Telegraf } from 'telegraf';
import { env } from '../config/env.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';
import type { MessageRepository } from '../db/repository.js';
import type { EventRepository } from '../db/eventRepository.js';
import { resolveChatOwner, listTelegramUsers, type TelegramUser } from '../db/users.js';
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
 * A quién hay que mandarle el resumen en este tick.
 *
 * Con base de datos, a TODOS los que tengan Telegram vinculado. Sin ella
 * (desarrollo local, sin `DATABASE_URL`) se cae al chat de
 * `TELEGRAM_CHAT_ID`, que es el único destinatario que se puede conocer —
 * así el modo de desarrollo sigue funcionando igual que siempre.
 *
 * Se resuelve en CADA tick y no una vez al arrancar: quien vincule su chat
 * con el bot ya corriendo empieza a recibir el resumen sin reiniciar nada.
 */
export async function destinatariosDelResumen(
  chatIdFallback: string | undefined,
): Promise<TelegramUser[]> {
  const usuarios = await listTelegramUsers();
  if (usuarios.length > 0) return usuarios;

  if (!chatIdFallback) return [];
  const chatId = Number(chatIdFallback);
  const userId = await resolveChatOwner(chatId);
  return userId ? [{ userId, chatId }] : [];
}

/**
 * Programa el resumen diario proactivo con node-cron.
 *
 * Cada usuario con Telegram vinculado recibe SU resumen en SU chat. Antes
 * iba a un único `TELEGRAM_CHAT_ID` global y, peor, la marca de "ya enviado
 * hoy" era una sola para todo el proceso: el primer envío del día bloqueaba
 * el de todos los demás. El resumen diario funcionaba para exactamente una
 * persona, el operador.
 *
 * Robustez ante reinicios:
 * - el cron dispara a la hora configurada cada día,
 * - además se ejecuta un "tick" de puesta al día al arrancar, por si el proceso
 *   estaba caído a la hora prevista,
 * - la idempotencia (marca de día persistida en fichero, POR USUARIO) impide
 *   duplicar el envío del mismo día en cualquiera de los dos caminos.
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
): DailySummaryHandle {
  const hour = env.DAILY_SUMMARY_HOUR;
  const store = new FileSummaryStateStore(
    env.DAILY_SUMMARY_STATE_FILE ?? DEFAULT_SUMMARY_STATE_FILE,
    (err) => logger.warn('summary.state_store_error', errorContext(err)),
  );

  const baseDeps: Omit<DailySummaryTickDeps, 'userId' | 'chatId' | 'send'> = {
    repository,
    store,
    focusStore,
    eventRepository,
    briefingGenerator,
    hour,
    logger,
  };

  const tick = async () => {
    let destinatarios: TelegramUser[];
    try {
      destinatarios = await destinatariosDelResumen(env.TELEGRAM_CHAT_ID);
    } catch (err) {
      logger.error('summary.recipients_failed', errorContext(err));
      return;
    }

    if (destinatarios.length === 0) {
      logger.warn('summary.no_recipients', {
        reason: 'ninguna cuenta tiene un chat de Telegram vinculado',
        hint: 'Vincula tu chat desde "Cuenta" en el dashboard (envía /vincular <código>).',
      });
      return;
    }

    // En serie y no en paralelo: son pocos usuarios y la API de Telegram
    // limita los envíos por segundo — mandarlos todos a la vez es la forma
    // rápida de que el propio Telegram empiece a rechazarlos.
    for (const { userId, chatId } of destinatarios) {
      try {
        await runDailySummaryTick({
          ...baseDeps,
          userId,
          chatId,
          send: (text) => bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' }).then(() => {}),
        });
      } catch (err) {
        // Un fallo con un usuario (chat bloqueado, cuenta borrada) no puede
        // dejar sin resumen a los siguientes de la lista.
        logger.error('summary.tick_failed', { userId, ...errorContext(err) });
      }
    }
  };

  logger.info('summary.scheduled', { hour });

  // Puesta al día al arrancar (por si el proceso estaba caído a la hora).
  void tick();

  // Disparo diario a la hora en punto configurada (hora local del servidor).
  const task: ScheduledTask = cron.schedule(`0 ${hour} * * *`, () => void tick());

  return { stop: () => task.stop() };
}
