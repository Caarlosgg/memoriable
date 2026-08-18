/**
 * Helpers puros del calendario (Fase I): sin I/O, para poder testearlos sin
 * tocar la base de datos. Todo en UTC a propósito — evita el lío de zonas
 * horarias al comparar "mismo día" entre servidor y cliente; la hora local
 * de verdad la resuelve el navegador al formatear (`formatDate`/`Intl`).
 */

/** Clave `YYYY-MM-DD` (UTC) — la unidad para agrupar "por día". */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Agrupa una lista por día, en un Map que conserva el orden de inserción. */
export function groupByDay<T>(items: T[], getDate: (item: T) => Date): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dateKey(getDate(item));
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/** Techo defensivo al expandir un rango de días — un dato mal introducido (fechaFin años después) no debe colgar el render. */
const MAX_RANGE_SPAN_DAYS = 366;

/**
 * Igual que `groupByDay`, pero para actividades que ocupan un RANGO de
 * días (Tier "calendario por periodos"): el item aparece bajo la clave de
 * CADA día que ocupa, de `from` a `to` inclusive — no solo el primero.
 * `to < from` (dato mal introducido) se trata como un rango de un solo
 * día en vez de desaparecer silenciosamente.
 */
export function groupByDayRange<T>(
  items: readonly T[],
  getRange: (item: T) => { from: Date; to: Date },
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const { from, to: rawTo } = getRange(item);
    const to = rawTo < from ? from : rawTo;

    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const endKey = dateKey(to);
    for (let i = 0; i < MAX_RANGE_SPAN_DAYS; i++) {
      const key = dateKey(cursor);
      const arr = map.get(key);
      if (arr) arr.push(item);
      else map.set(key, [item]);
      if (key >= endKey) break;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return map;
}

export interface MonthDay {
  date: Date;
  /** Falso para los días de relleno del mes anterior/siguiente que completan la cuadrícula. */
  inMonth: boolean;
  isToday: boolean;
}

/**
 * Cuadrícula de 6 semanas (42 días) para un mes, empezando en lunes —
 * incluye días del mes anterior/siguiente para rellenar la primera y
 * última semana, como cualquier calendario mensual.
 */
export function buildMonthGrid(year: number, month: number, today: Date = new Date()): MonthDay[] {
  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - startWeekday);

  const todayKey = dateKey(today);
  const days: MonthDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    days.push({ date, inMonth: date.getUTCMonth() === month, isToday: dateKey(date) === todayKey });
  }
  return days;
}

export interface WeekDay {
  date: Date;
  isToday: boolean;
}

/**
 * Los 7 días (lunes a domingo) de la semana que contiene `cursor`. Vista
 * alternativa a `buildMonthGrid` para cuando el mes entero es demasiado
 * comprimido para ver bien un día con varios eventos — mismo criterio de
 * semana-empieza-en-lunes que la vista mensual.
 */
export function buildWeekGrid(cursor: Date, today: Date = new Date()): WeekDay[] {
  const startWeekday = (cursor.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  const start = new Date(cursor);
  start.setUTCDate(cursor.getUTCDate() - startWeekday);

  const todayKey = dateKey(today);
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    days.push({ date, isToday: dateKey(date) === todayKey });
  }
  return days;
}

/** Minutos por hora — para convertir HH:mm a "minutos desde medianoche" y viceversa. */
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** Minutos desde medianoche (00:00) de un evento, en las mismas horas UTC "forzadas" que ya usa `formatEventTime` — así una tarjeta y su posición en la rejilla siempre coinciden. */
function minutesSinceMidnight(d: Date): number {
  return d.getUTCHours() * MINUTES_PER_HOUR + d.getUTCMinutes();
}

export interface DayEventLayout<T> {
  item: T;
  /** Minutos desde medianoche a los que empieza, recortado a [0, 1440). */
  topMinutes: number;
  /** Duración en minutos, con un mínimo para que un evento puntual siga siendo legible/clicable. */
  durationMinutes: number;
  /** Carril (0-indexado) dentro del día — para eventos que se solapan, se reparten el ancho de la columna. */
  lane: number;
  /** Carriles totales que usa ESE día — todos los eventos del mismo día comparten este número, para dividir el ancho a partes iguales. */
  lanesInDay: number;
}

const MIN_EVENT_DURATION_MINUTES = 30;

/**
 * Reparte los eventos de UN día en "carriles" horizontales para una rejilla
 * horaria (vista semanal): un algoritmo voraz de asignación de intervalos —
 * ordena por inicio y mete cada evento en el primer carril cuyo último
 * evento ya haya terminado, o abre uno nuevo si no cabe en ninguno. Es la
 * misma idea que usan Google Calendar/Outlook para eventos solapados
 * ("reunión de 10 a 11" y "llamada de 10:30 a 11:30" acaban uno al lado del
 * otro, no superpuestos). Pura y testeable: recibe fechas ya resueltas, no
 * consulta nada.
 */
export function layoutDayEvents<T>(
  items: readonly T[],
  getRange: (item: T) => { start: Date; end: Date | null },
): DayEventLayout<T>[] {
  const withMinutes = items
    .map((item) => {
      const { start, end } = getRange(item);
      const topMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - 1, minutesSinceMidnight(start)));
      const rawEnd = end && end > start ? minutesSinceMidnight(end) : topMinutes + MIN_EVENT_DURATION_MINUTES;
      const durationMinutes = Math.max(MIN_EVENT_DURATION_MINUTES, Math.min(MINUTES_PER_DAY - topMinutes, rawEnd - topMinutes));
      return { item, topMinutes, durationMinutes };
    })
    // Los que empiezan antes van primero; a igualdad, el más largo primero
    // (así ocupa un carril "de fondo" y los cortos se acomodan al lado).
    .sort((a, b) => a.topMinutes - b.topMinutes || b.durationMinutes - a.durationMinutes);

  // Fin (en minutos) del último evento metido en cada carril, por índice.
  const laneEnds: number[] = [];
  const withLane = withMinutes.map((entry) => {
    const endMinutes = entry.topMinutes + entry.durationMinutes;
    let lane = laneEnds.findIndex((end) => end <= entry.topMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endMinutes);
    } else {
      laneEnds[lane] = endMinutes;
    }
    return { ...entry, lane };
  });

  const lanesInDay = Math.max(1, laneEnds.length);
  return withLane.map((entry) => ({ ...entry, lanesInDay }));
}

/** Los próximos `days` días (incluido hoy), como rango [desde, hasta) para consultar eventos. */
export function upcomingRange(days: number, today: Date = new Date()): { desde: Date; hasta: Date } {
  const desde = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const hasta = new Date(desde);
  hasta.setUTCDate(hasta.getUTCDate() + days);
  return { desde, hasta };
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

/** Etiqueta legible de una `dateKey` ("Hoy", "Mañana", o "martes, 12 ago"). */
export function dayLabel(key: string, today: Date = new Date()): string {
  const todayKey = dateKey(today);
  if (key === todayKey) return "Hoy";

  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (key === dateKey(tomorrow)) return "Mañana";

  return WEEKDAY_FORMATTER.format(new Date(`${key}T00:00:00.000Z`));
}

/** ¿Una fecha límite ("aplazar tarea") ya pasó? Compara por día, no por hora — "hoy" nunca cuenta como vencida. */
export function isOverdue(fechaLimite: Date, today: Date = new Date()): boolean {
  return dateKey(fechaLimite) < dateKey(today);
}

/**
 * Frecuencias de repetición para eventos/movimientos periódicos — usado
 * tanto por la tool `crearEvento` del Asistente (assistantTools.ts) como
 * por el formulario manual de /calendario (EventDetailDialog.tsx), un
 * único sitio para no tener dos copias de la misma lógica.
 */
export const FRECUENCIAS = ["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

/** Fecha de la repetición número `i` (0 = la primera, sin desplazar) a partir de una fecha base. */
export function fechaRepeticion(base: Date, frecuencia: Frecuencia, i: number): Date {
  const d = new Date(base);
  switch (frecuencia) {
    case "DIARIA":
      d.setDate(d.getDate() + i);
      break;
    case "SEMANAL":
      d.setDate(d.getDate() + i * 7);
      break;
    case "QUINCENAL":
      d.setDate(d.getDate() + i * 14);
      break;
    case "MENSUAL":
      d.setMonth(d.getMonth() + i);
      break;
  }
  return d;
}

/**
 * Meses que se cargan de golpe alrededor del mes que se está viendo, para
 * el calendario (ver getEventosEnRango/getTasksEnRango en lib/eventos.ts).
 * Cubre de sobra el uso normal (mirar atrás un par de meses, planificar el
 * siguiente) sin traerse el historial entero — con un equipo llevando un
 * año en la aplicación, "todos los eventos" son miles de filas en CADA
 * carga y casi ninguna se llega a mirar.
 *
 * Pura (sin "server-only"): la usan tanto el servidor (la carga inicial de
 * la página) como el cliente (CalendarView, al pedir el tramo que falte al
 * navegar) — mismo criterio que el resto de este archivo.
 */
export const CALENDARIO_MESES_MARGEN = 2;

/** Primer día del mes `margen` antes de `referencia`, y primer día del mes `margen` después — en UTC, igual que la rejilla. */
export function rangoCalendario(referencia: Date, margen = CALENDARIO_MESES_MARGEN): { desde: Date; hasta: Date } {
  const year = referencia.getUTCFullYear();
  const month = referencia.getUTCMonth();
  return {
    desde: new Date(Date.UTC(year, month - margen, 1)),
    hasta: new Date(Date.UTC(year, month + margen + 1, 1)),
  };
}
