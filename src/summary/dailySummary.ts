import type { MessageRepository, StoredMessage } from '../db/repository.js';
import type { EventRepository, EventSummary } from '../db/eventRepository.js';
import { formatResponseCard } from '../telegram/formatResponseCard.js';
import type { Logger } from '../logging/logger.js';
import type { SummaryStateStore } from './summaryState.js';
import type { FocusStateStore } from './focusState.js';
import type { BriefingGenerator, BriefingResult } from '../ai/briefing.js';

/** Separador visual entre tarjetas, igual que en las listas del bot. */
const CARD_SEPARATOR = '\n\n➖➖➖\n\n';

/** Máximo de candidatas a "foco del día" (Tier 2.6) — más de 3 deja de ser un vistazo rápido. */
const MAX_FOCUS_CANDIDATES = 3;
const MAX_FOCUS_EVENTS = 2;

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

/** Rango semiabierto `[from, to)` que cubre el día natural de `now` — eventos "de hoy" para el foco del día. */
export function todayRange(now: Date): { from: Date; to: Date } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: startOfToday, to: startOfTomorrow };
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
 * Elige hasta 3 candidatas a "foco del día" (Tier 2.6): primero los eventos
 * de hoy (ya tienen hora fija, son la señal más fuerte de "esto toca hoy"),
 * y se rellena el resto con los pendientes más recientes. Pura: no sabe
 * nada de Telegram ni de persistencia, solo elige y ordena texto.
 */
export function pickFocusCandidates(
  pending: readonly StoredMessage[],
  eventosHoy: readonly EventSummary[],
): string[] {
  const fromEvents = eventosHoy.slice(0, MAX_FOCUS_EVENTS).map((e) => e.titulo);
  const remaining = Math.max(0, MAX_FOCUS_CANDIDATES - fromEvents.length);
  const fromPending = pending
    .slice(0, remaining)
    .map((m) => m.resumen)
    .filter((label) => label.trim() !== '');
  return [...fromEvents, ...fromPending].slice(0, MAX_FOCUS_CANDIDATES);
}

/** Construye la pregunta de seguimiento con las candidatas, o `''` si no hay ninguna (no fuerza la conversación). */
function focusPrompt(candidates: readonly string[]): string {
  if (candidates.length === 0) return '';
  const numbered = candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
  return `🎯 <b>¿Cuál es tu foco de hoy?</b>\n\n${numbered}\n\nRespóndeme cuál te importa más y la marco como tu foco de hoy.`;
}

/**
 * Sección del "consultor de productividad" (Daily Briefing, Tier P1) — solo
 * se añade cuando hay un `BriefingGenerator` de verdad (con o sin IA real
 * detrás, ver briefing.ts). Omite bloques vacíos: sin advertencias no hay
 * sección de advertencias, en vez de un "⚠️ nada que avisar" que no aporta.
 */
function formatBriefingSection(result: BriefingResult): string {
  const parts = [`🎯 <b>Misión principal</b>\n${result.misionPrincipal}`];
  if (result.bloqueManana.length > 0) {
    parts.push(`🧭 <b>Bloque mañana</b> (trabajo profundo)\n${result.bloqueManana.map((b) => `• ${b}`).join('\n')}`);
  }
  if (result.bloqueTarde.length > 0) {
    parts.push(`🌤️ <b>Bloque tarde</b>\n${result.bloqueTarde.map((b) => `• ${b}`).join('\n')}`);
  }
  if (result.advertencias.length > 0) {
    parts.push(`⚠️ <b>Ojo con esto</b>\n${result.advertencias.map((a) => `• ${a}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * Compone el texto (HTML de Telegram) del resumen diario: encabezado con la
 * fecha, el briefing del consultor (si hay uno), los pendientes actuales,
 * lo guardado ayer y, si hay algo que proponer, la pregunta del foco del
 * día. Función pura de presentación, sin I/O.
 */
export function formatDailySummary({
  pending,
  savedYesterday,
  focusCandidates = [],
  briefing,
  now,
}: {
  pending: readonly StoredMessage[];
  savedYesterday: readonly StoredMessage[];
  focusCandidates?: readonly string[];
  briefing?: BriefingResult;
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
  const parts = [header];
  if (briefing) parts.push(formatBriefingSection(briefing));
  parts.push(pendingSection, yesterdaySection);
  const prompt = focusPrompt(focusCandidates);
  if (prompt) parts.push(prompt);
  return parts.join('\n\n');
}

export interface DailySummaryContent {
  text: string;
  /** Candidatas propuestas para el foco del día — vacío si no había nada que proponer. */
  focusCandidates: string[];
}

/**
 * Reúne los datos (pendientes + lo de ayer + eventos de hoy) y compone el
 * resumen. Recibe los repositorios por inyección, de modo que es testeable
 * con implementaciones en memoria. `eventRepository` es opcional: sin él
 * (p. ej. en tests que no les interesa el calendario), el resumen sigue
 * funcionando igual que antes, solo sin la sección de eventos.
 *
 * `briefingGenerator` es opcional (Tier P1): con él, el resumen incluye el
 * análisis del "consultor" (misión principal, bloques, advertencias) y las
 * candidatas a foco del día se toman de SU elección — no tendría sentido
 * preguntar "¿cuál es tu foco?" con una heurística aparte cuando el propio
 * briefing ya ha decidido cuál es la misión principal.
 */
export async function buildDailySummary(
  repository: MessageRepository,
  userId: string,
  now: Date,
  eventRepository?: EventRepository,
  briefingGenerator?: BriefingGenerator,
): Promise<DailySummaryContent> {
  const { from, to } = yesterdayRange(now);
  const todayRangeValue = todayRange(now);
  const [pending, savedYesterday, eventosHoy] = await Promise.all([
    repository.pending(userId),
    repository.savedBetween(userId, from, to),
    eventRepository ? eventRepository.eventsBetween(userId, todayRangeValue.from, todayRangeValue.to) : Promise.resolve([]),
  ]);

  const briefing = briefingGenerator ? await briefingGenerator.generate({ pending, eventosHoy, now }) : undefined;
  const focusCandidates = briefing
    ? [briefing.misionPrincipal, ...briefing.bloqueManana.filter((b) => b !== briefing.misionPrincipal)].slice(
        0,
        MAX_FOCUS_CANDIDATES,
      )
    : pickFocusCandidates(pending, eventosHoy);

  const text = formatDailySummary({ pending, savedYesterday, focusCandidates, briefing, now });
  return { text, focusCandidates };
}

export interface DailySummaryTickDeps {
  repository: MessageRepository;
  /** Cuenta dueña del chat al que se envía el resumen (Fase 2, multiusuario). */
  userId: string;
  store: SummaryStateStore;
  /** Chat de Telegram al que se manda — necesario para marcar el foco del día en `focusStore`. */
  chatId: number;
  /** Estado del "ritual matutino" (Tier 2.6). Opcional: sin él, no se propone foco del día. */
  focusStore?: FocusStateStore;
  eventRepository?: EventRepository;
  /** Generador del Daily Briefing (Tier P1). Opcional: sin él, el resumen es el de siempre (sin sección de consultor). */
  briefingGenerator?: BriefingGenerator;
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
 *
 * Si el resumen trae candidatas a foco del día, marca el chat como
 * "esperando respuesta" en `focusStore` — el handler de texto del bot
 * (`telegram/bot.ts`) es quien consume esa marca en el siguiente mensaje.
 */
export async function runDailySummaryTick(
  deps: DailySummaryTickDeps,
): Promise<DailySummaryTickResult> {
  const now = (deps.now ?? (() => new Date()))();

  if (!isAtOrAfterHour(now, deps.hour)) return 'before_hour';

  const key = dayKey(now);
  // La marca es POR USUARIO: con una sola para todo el proceso, el primer
  // envío del día bloqueaba el de todos los demás y el resumen diario
  // funcionaba para exactamente una persona.
  if (deps.store.lastSentDay(deps.userId) === key) return 'already_sent_today';

  const { text, focusCandidates } = await buildDailySummary(
    deps.repository,
    deps.userId,
    now,
    deps.eventRepository,
    deps.briefingGenerator,
  );
  await deps.send(text);
  deps.store.markSent(key, deps.userId);
  if (focusCandidates.length > 0) deps.focusStore?.setAwaiting(deps.chatId, key);
  deps.logger?.info('summary.sent', { day: key, userId: deps.userId, focusCandidates: focusCandidates.length });
  return 'sent';
}
