/**
 * Agrupa intercambios del Asistente por día (UTC, igual que el resto del
 * proyecto — ver utcDay() en src/cost/budget.ts del bot). Sin imports de
 * Prisma/servidor a propósito: función pura, usable tanto en el servidor
 * (para pasar el historial ya agrupado a un Client Component) como en
 * tests, sin arrastrar nada más.
 */

export interface ExchangeLike {
  id: string;
  pregunta: string;
  respuesta: string;
  fecha: Date;
}

export interface ExchangeDayGroup {
  /** Clave del día, YYYY-MM-DD (UTC). */
  day: string;
  /** Etiqueta legible: "Hoy", "Ayer", o la fecha. */
  label: string;
  exchanges: ExchangeLike[];
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return "Hoy";
  if (day === yesterday) return "Ayer";
  const [year, month, dayOfMonth] = day.split("-");
  return `${dayOfMonth}/${month}/${year}`;
}

/**
 * Agrupa manteniendo el orden de llegada de `exchanges` (se asume ya
 * ordenado por fecha descendente, como devuelve getRecentExchanges()) —
 * no reordena nada por su cuenta.
 */
export function groupExchangesByDay(exchanges: ExchangeLike[], now: Date = new Date()): ExchangeDayGroup[] {
  const today = utcDayKey(now);
  const yesterday = utcDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const groups: ExchangeDayGroup[] = [];
  const indexByDay = new Map<string, number>();

  for (const exchange of exchanges) {
    const day = utcDayKey(exchange.fecha);
    let index = indexByDay.get(day);
    if (index === undefined) {
      index = groups.length;
      indexByDay.set(day, index);
      groups.push({ day, label: dayLabel(day, today, yesterday), exchanges: [] });
    }
    groups[index]!.exchanges.push(exchange);
  }

  return groups;
}
