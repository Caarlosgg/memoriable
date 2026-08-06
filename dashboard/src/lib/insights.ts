import "server-only";
import { prisma } from "./prisma";

const WEEKS_BACK = 6;
const MONTHS_BACK = 6;

export interface WeeklyCount {
  /** Lunes de esa semana, ISO (YYYY-MM-DD). */
  weekStart: string;
  count: number;
}

export interface SavingsMonthPoint {
  /** YYYY-MM. */
  month: string;
  balanceCentimos: number;
}

export interface InsightsData {
  /** Notas/tareas guardadas por semana, últimas 6 semanas (incluida la actual). Basado en fecha de creación — no hay fecha de "completado" en el esquema actual, ver comentario más abajo. */
  notesByWeek: WeeklyCount[];
  /** Semanas consecutivas (hasta la actual) con ahorro neto positivo en alguna cuenta. 0 si esta semana no es positiva. */
  savingsStreak: number;
  /** Saldo total acumulado (todas las cuentas) al final de cada uno de los últimos 6 meses. */
  savingsEvolution: SavingsMonthPoint[];
}

/** Lunes (00:00 local) de la semana a la que pertenece `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = d.getDay(); // 0 = domingo
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Agrupa fechas en cubos semanales (lunes a domingo), las últimas
 * `weeksBack` semanas incluida la actual, más antigua primero. Pura:
 * mismo criterio que `lib/calendar.ts` — testeable sin base de datos.
 */
export function groupByWeek(dates: readonly Date[], weeksBack: number, now: Date): WeeklyCount[] {
  const currentMonday = mondayOf(now);
  const buckets: WeeklyCount[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(weekStart.getDate() - i * 7);
    buckets.push({ weekStart: isoDate(weekStart), count: 0 });
  }
  const indexByWeek = new Map(buckets.map((b, i) => [b.weekStart, i]));

  for (const date of dates) {
    const key = isoDate(mondayOf(date));
    const index = indexByWeek.get(key);
    if (index !== undefined) buckets[index]!.count++;
  }
  return buckets;
}

/**
 * Semanas consecutivas (empezando por la actual, hacia atrás) en las que
 * la suma de movimientos fue positiva. Se para en la primera semana que no
 * lo sea (o sin movimientos) — igual que una racha de verdad: un hueco la
 * corta. Pura.
 */
export function computeSavingsStreak(
  movimientos: readonly { fecha: Date; centimos: number }[],
  now: Date,
): number {
  const netByWeek = new Map<string, number>();
  for (const m of movimientos) {
    const key = isoDate(mondayOf(m.fecha));
    netByWeek.set(key, (netByWeek.get(key) ?? 0) + m.centimos);
  }

  let streak = 0;
  const cursor = mondayOf(now);
  for (;;) {
    const key = isoDate(cursor);
    const net = netByWeek.get(key);
    if (net === undefined || net <= 0) break;
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/**
 * Saldo acumulado (todas las cuentas) al cierre de cada uno de los
 * últimos `monthsBack` meses, más antiguo primero. Pura.
 */
export function computeSavingsEvolution(
  movimientos: readonly { fecha: Date; centimos: number }[],
  monthsBack: number,
  now: Date,
): SavingsMonthPoint[] {
  const sorted = [...movimientos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const points: SavingsMonthPoint[] = [];
  let cursorIndex = 0;
  let running = 0;

  for (let i = monthsBack - 1; i >= 0; i--) {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); // exclusivo
    while (cursorIndex < sorted.length && sorted[cursorIndex]!.fecha.getTime() < endOfMonth.getTime()) {
      running += sorted[cursorIndex]!.centimos;
      cursorIndex++;
    }
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    points.push({ month, balanceCentimos: running });
  }
  return points;
}

/**
 * Nota sobre "tareas completadas por semana": el esquema actual no guarda
 * CUÁNDO se marcó una tarea como hecha (`Message` no tiene
 * `completadoEn`), solo su fecha de creación y su estado actual — así que
 * "completadas esta semana" no es un dato que se pueda leer hoy sin
 * inventarlo. En su lugar se muestra "guardadas por semana" (con la fecha
 * de creación, que sí es exacta) como proxy honesto de actividad. Añadir
 * `completadoEn` queda diseñado para otra sesión (ver informe), no
 * aplicado — es un cambio de esquema y CLAUDE.md exige confirmación
 * explícita siempre, sin excepción.
 */
export async function getInsights(userId: string): Promise<InsightsData> {
  const now = new Date();
  const sinceWeeks = new Date(now);
  sinceWeeks.setDate(sinceWeeks.getDate() - WEEKS_BACK * 7);
  const sinceMonths = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK + 1, 1);
  const since = sinceWeeks < sinceMonths ? sinceWeeks : sinceMonths;

  const [notas, movimientos] = await Promise.all([
    prisma.message.findMany({ where: { userId, fecha: { gte: sinceWeeks } }, select: { fecha: true } }),
    prisma.movimientoAhorro.findMany({
      where: { cuenta: { userId }, fecha: { gte: since } },
      select: { fecha: true, centimos: true },
    }),
  ]);

  return {
    notesByWeek: groupByWeek(notas.map((n) => n.fecha), WEEKS_BACK, now),
    savingsStreak: computeSavingsStreak(movimientos, now),
    savingsEvolution: computeSavingsEvolution(movimientos, MONTHS_BACK, now),
  };
}
