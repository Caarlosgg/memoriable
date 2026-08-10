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
