import "server-only";
import { prisma } from "./prisma";

/** Día en curso en formato YYYY-MM-DD (UTC) — mismo formato que el fusible del bot (src/cost/budget.ts). */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fusible de coste propio del Asistente (independiente de
 * MAX_MESSAGES_PER_DAY, que es solo del bot — ver ASSISTANT_MAX_QUESTIONS_PER_DAY
 * en .env.example). No se reutiliza la clase `DailyBudget` del bot
 * (src/cost/budget.ts) tal cual: su `BudgetStore` es síncrono (pensado para
 * un fichero local), y el dashboard es serverless — sin disco persistente
 * entre invocaciones — así que el contador necesita ser async y vivir en
 * Postgres. La política (un contador que resetea solo al cambiar el día) es
 * la misma; la implementación no, por eso no es un import compartido.
 *
 * Devuelve `true` si la pregunta se puede procesar (la cuenta ya queda
 * reservada al llamar); `false` si el fusible está fundido por hoy.
 */
export async function tryConsumeAssistantBudget(maxPerDay: number): Promise<boolean> {
  if (maxPerDay <= 0) return false;

  const day = utcDay(new Date());
  const row = await prisma.assistantBudget.upsert({
    where: { day },
    create: { day, count: 1 },
    update: { count: { increment: 1 } },
  });

  return row.count <= maxPerDay;
}
