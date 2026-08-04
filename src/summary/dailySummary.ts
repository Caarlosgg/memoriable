import type { MessageRepository, StoredMessage } from '../db/repository.js';
import { formatResponseCard } from '../telegram/formatResponseCard.js';
import type { Logger } from '../logging/logger.js';
import type { SummaryStateStore } from './summaryState.js';

/** Separador visual entre tarjetas, igual que en las listas del bot. */
const CARD_SEPARATOR = '\n\n➖➖➖\n\n';

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/**
 * Clave de día (YYYY-MM-DD, hora local) que identifica un envío. Se usa como
 * marca de idempotencia: un mismo día no se envía dos veces. Lógica pura, sin
 * reloj real, para testearla con una fecha fija.
 */
export function dayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Rango semiabierto `[from, to)` que cubre el día natural ANTERIOR a `now`
 * (medianoche a medianoche, hora local). Es "lo guardado ayer". Pura y
 * determinista: depende solo de `now`, no del reloj del sistema.
 */
export function yesterdayRange(now: Date): { from: Date; to: Date } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return { from: startOfYesterday, to: startOfToday };
}

/** ¿Es `now` igual o posterior a la hora `hour` (0-23) de su propio día? */
export function isAtOrAfterHour(now: Date, hour: number): boolean {
  return now.getHours() >= hour;
}

/** Construye una sección con título y tarjetas, o una nota si está vacía. */
function section(title: string, messages: readonly StoredMessage[], emptyNote: string): string {
  if (messages.length === 0) return `${title}\n${emptyNote}`;
  const cards = messages.map((m) => formatResponseCard(m)).join(CARD_SEPARATOR);
  return `${title}\n\n${cards}`;
}

/**
 * Compone el texto (HTML de Telegram) del resumen diario: encabezado con la
 * fecha, los pendientes actuales y lo guardado ayer. Función pura de
 * presentación, sin I/O.
 */
export function formatDailySummary({
  pending,
  savedYesterday,
  now,
}: {
  pending: readonly StoredMessage[];
  savedYesterday: readonly StoredMessage[];
  now: Date;
}): string {
  const header = `☀️ <b>Resumen diario</b> · ${DAY_LABEL_FORMATTER.format(now)}`;
  const pendingSection = section(
    '📋 <b>Pendientes</b>',
    pending,
    '✅ No tienes nada pendiente. ¡Bien!',
  );
  const yesterdaySection = section(
    '🗒️ <b>Guardado ayer</b>',
    savedYesterday,
    '🌙 Ayer no guardaste nada.',
  );
  return [header, pendingSection, yesterdaySection].join('\n\n');
}

/**
 * Reúne los datos (pendientes + lo de ayer) y compone el resumen. Recibe el
 * repositorio por inyección, de modo que es testeable con uno en memoria.
 */
export async function buildDailySummary(
  repository: MessageRepository,
  userId: string,
  now: Date,
): Promise<string> {
  const { from, to } = yesterdayRange(now);
  const [pending, savedYesterday] = await Promise.all([
    repository.pending(userId),
    repository.savedBetween(userId, from, to),
  ]);
  return formatDailySummary({ pending, savedYesterday, now });
}

export interface DailySummaryTickDeps {
  repository: MessageRepository;
  /** Cuenta dueña del chat al que se envía el resumen (Fase 2, multiusuario). */
  userId: string;
  store: SummaryStateStore;
  /** Envía el texto al chat del usuario. Inyectado para testear sin red. */
  send: (text: string) => Promise<void>;
  /** Hora local (0-23) a partir de la cual procede enviar. */
  hour: number;
  /** Reloj inyectable; por defecto el real. */
  now?: () => Date;
  logger?: Logger;
}

export type DailySummaryTickResult = 'sent' | 'already_sent_today' | 'before_hour';

/**
 * Envía el resumen diario si procede, de forma idempotente:
 * - no envía antes de la hora configurada,
 * - no envía dos veces el mismo día (marca persistida en `store`).
 *
 * La marca se escribe SOLO tras un envío correcto, así un fallo de red se
 * reintenta en el siguiente tick en vez de perder el resumen del día. Sirve
 * tanto para el disparo programado como para la puesta al día tras un reinicio.
 */
export async function runDailySummaryTick(
  deps: DailySummaryTickDeps,
): Promise<DailySummaryTickResult> {
  const now = (deps.now ?? (() => new Date()))();

  if (!isAtOrAfterHour(now, deps.hour)) return 'before_hour';

  const key = dayKey(now);
  if (deps.store.lastSentDay() === key) return 'already_sent_today';

  const text = await buildDailySummary(deps.repository, deps.userId, now);
  await deps.send(text);
  deps.store.markSent(key);
  deps.logger?.info('summary.sent', { day: key });
  return 'sent';
}
