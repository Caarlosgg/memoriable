import type { StoredMessage } from '../db/repository.js';
import type { EventSummary } from '../db/eventRepository.js';
import type { GroqChatClient } from './categorizer.js';

/** Días de antigüedad a partir de los cuales un pendiente se considera "atascado". */
const STUCK_AFTER_DAYS = 5;
/** Nº de pendientes a partir del cual se avisa de sobrecarga. */
const OVERLOAD_THRESHOLD = 8;

/** Una candidata numerada (tarea pendiente o evento de hoy) que la IA puede elegir como misión principal. */
export interface BriefingCandidate {
  /** 1-indexado: el número que ve la IA en el prompt y que devuelve para elegir. */
  index: number;
  label: string;
  /** Presente solo si la candidata es una tarea pendiente real (para poder enlazarla después, p. ej. a un botón "hecho"). */
  messageId?: string;
}

export interface BriefingInput {
  pending: readonly StoredMessage[];
  eventosHoy: readonly EventSummary[];
  now: Date;
}

export interface BriefingResult {
  /** Texto de la misión principal — siempre presente, aunque sea "hoy no tienes nada pendiente". */
  misionPrincipal: string;
  /** `id` de la tarea pendiente que es la misión principal, si la IA eligió una (no un evento ni "nada"). */
  misionPrincipalMessageId?: string;
  bloqueManana: string[];
  bloqueTarde: string[];
  advertencias: string[];
}

export interface BriefingGenerator {
  generate(input: BriefingInput): Promise<BriefingResult>;
}

function diasDesde(fecha: Date, now: Date): number {
  return Math.floor((now.getTime() - fecha.getTime()) / (24 * 60 * 60 * 1000));
}

/** Quita la anotación interna `(evento, HH:MM)`/`(tarea)` de un label de candidata — esa anotación es solo para el prompt de la IA, nunca para lo que lee el usuario. */
function cleanLabel(label: string): string {
  return label.replace(/^\((evento|tarea)[^)]*\)\s*/, '');
}

const HORA_FORMATTER = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Construye la lista numerada de candidatas (eventos de hoy primero, luego
 * pendientes) que se le da a la IA para elegir — nunca al revés (texto
 * libre): así la respuesta ("elige la nº 3") siempre mapea a un objeto
 * real, sin depender de que la IA cite el texto exacto. Pura.
 */
export function buildCandidates(pending: readonly StoredMessage[], eventosHoy: readonly EventSummary[]): BriefingCandidate[] {
  let index = 1;
  const eventos: BriefingCandidate[] = eventosHoy.map((e) => ({
    index: index++,
    label: `(evento, ${HORA_FORMATTER.format(e.fechaInicio)}) ${e.titulo}`,
  }));
  const tareas: BriefingCandidate[] = pending.map((m) => ({
    index: index++,
    label: `(tarea) ${m.resumen}`,
    messageId: m.id,
  }));
  return [...eventos, ...tareas];
}

/**
 * Fallback determinista (sin IA): usado si Groq falla, se agota el
 * presupuesto, o no hay `GROQ_API_KEY`. Nunca dice "no sé" — siempre da
 * una misión principal razonable (el primer evento de hoy, o si no la
 * primera pendiente, o si no hay nada un mensaje honesto de día libre).
 */
export class OfflineBriefingGenerator implements BriefingGenerator {
  async generate({ pending, eventosHoy, now }: BriefingInput): Promise<BriefingResult> {
    const candidates = buildCandidates(pending, eventosHoy);
    const primera = candidates[0];

    const advertencias: string[] = [];
    if (pending.length > OVERLOAD_THRESHOLD) {
      advertencias.push(`Tienes ${pending.length} pendientes acumulados — puede que convenga revisar cuáles siguen mereciendo la pena.`);
    }
    const atascada = pending.find((m) => diasDesde(m.fecha, now) >= STUCK_AFTER_DAYS);
    if (atascada) {
      advertencias.push(`«${atascada.resumen}» lleva ${diasDesde(atascada.fecha, now)} días pendiente sin moverse.`);
    }

    return {
      misionPrincipal: primera ? cleanLabel(primera.label) : 'Hoy no tienes nada pendiente ni ningún evento — día libre.',
      misionPrincipalMessageId: primera?.messageId,
      bloqueManana: candidates.slice(0, 3).map((c) => cleanLabel(c.label)),
      bloqueTarde: candidates.slice(3, 6).map((c) => cleanLabel(c.label)),
      advertencias,
    };
  }
}

const SYSTEM_PROMPT = [
  'Eres un consultor de productividad breve y directo, hablas en español.',
  'Te doy una lista NUMERADA de tareas pendientes y eventos de hoy de una persona.',
  'Devuelve SIEMPRE un JSON válido con estos campos:',
  '  - "mision_principal_indice": el número (de la lista de arriba) de la ÚNICA cosa',
  '    que más impacto tiene y debería hacer PRIMERO hoy — la "tarea rana". 0 si la',
  '    lista está vacía.',
  '  - "bloque_manana": array de hasta 3 strings cortos con lo que tocaría en un',
  '    bloque de mañana (trabajo profundo / lo más importante) — puede repetir la',
  '    misión principal si encaja ahí.',
  '  - "bloque_tarde": array de hasta 3 strings cortos, tareas secundarias u',
  '    operativas para la tarde. Vacío si no sobra nada para la tarde.',
  '  - "advertencias": array de 0-2 strings, SOLO si de verdad hay sobrecarga (muchos',
  '    pendientes) o algo lleva atascado varios días — si todo está bajo control,',
  '    array vacío. No inventes una advertencia que no esté justificada por los datos.',
  'No inventes tareas ni eventos que no estén en la lista numerada. No añadas texto',
  'fuera del JSON.',
].join('\n');

function candidateLine(c: BriefingCandidate, pending: readonly StoredMessage[], now: Date): string {
  if (!c.messageId) return `${c.index}. ${c.label}`;
  const original = pending.find((m) => m.id === c.messageId);
  const dias = original ? diasDesde(original.fecha, now) : 0;
  const antiguedad = dias >= 1 ? ` — pendiente desde hace ${dias} ${dias === 1 ? 'día' : 'días'}` : '';
  return `${c.index}. ${c.label}${antiguedad}`;
}

function buildUserContent(candidates: BriefingCandidate[], pending: readonly StoredMessage[], now: Date): string {
  if (candidates.length === 0) return 'No hay ninguna tarea pendiente ni ningún evento hoy.';
  return ['Candidatas de hoy:', ...candidates.map((c) => candidateLine(c, pending, now))].join('\n');
}

function firstText(choices: Array<{ message?: { content?: string | null } }>): string {
  const content = choices[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('La respuesta de Groq no contiene ningún bloque de texto.');
  }
  return content;
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim().slice(0, 200))
    .slice(0, max);
}

/**
 * Normaliza la respuesta cruda del modelo a un `BriefingResult`, resuelto
 * contra las candidatas reales (nunca confía en texto libre del modelo
 * para identificar la misión principal, solo en el índice). Tolerante:
 * un índice fuera de rango cae a la primera candidata, arrays malformados
 * caen a vacío — nunca lanza por una respuesta rara del modelo.
 */
export function parseBriefing(raw: string, candidates: BriefingCandidate[]): BriefingResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('La respuesta del modelo no es un JSON válido: ' + raw.slice(0, 200));
  }
  const record = (data ?? {}) as Record<string, unknown>;

  const indiceRaw = record.mision_principal_indice;
  const indice = typeof indiceRaw === 'number' ? indiceRaw : Number.NaN;
  const elegida = candidates.find((c) => c.index === indice);
  const misionPrincipal = elegida
    ? cleanLabel(elegida.label)
    : candidates.length === 0
      ? 'Hoy no tienes nada pendiente ni ningún evento — día libre.'
      : cleanLabel(candidates[0]!.label);

  return {
    misionPrincipal,
    misionPrincipalMessageId: elegida?.messageId ?? (indice === 0 ? undefined : candidates[0]?.messageId),
    bloqueManana: asStringArray(record.bloque_manana, 3),
    bloqueTarde: asStringArray(record.bloque_tarde, 3),
    advertencias: asStringArray(record.advertencias, 2),
  };
}

/**
 * Genera el briefing con Groq. No conoce Telegram ni la base de datos —
 * mismo criterio que `GroqCategorizer`: solo transforma datos ya
 * resueltos dado un cliente y modelo.
 */
export class GroqBriefingGenerator implements BriefingGenerator {
  constructor(
    private readonly client: GroqChatClient,
    private readonly model: string,
  ) {}

  async generate({ pending, eventosHoy, now }: BriefingInput): Promise<BriefingResult> {
    const candidates = buildCandidates(pending, eventosHoy);
    const response = await this.client.chat.completions.create({
      model: this.model,
      // 'medium' (no 'low' como el categorizador): esto es un juicio de
      // priorización, no una clasificación — y pasa como mucho unas pocas
      // veces al día, así que el coste/latencia extra compensa la calidad.
      reasoning_effort: 'medium',
      reasoning_format: 'hidden',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_completion_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(candidates, pending, now) },
      ],
    });

    return parseBriefing(firstText(response.choices), candidates);
  }
}
