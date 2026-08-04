import "server-only";
import { prisma } from "./prisma";

export interface AssistantExchangeRecord {
  id: string;
  pregunta: string;
  respuesta: string;
  fecha: Date;
}

/** Guarda un intercambio ya completado. No crítico: un fallo aquí no debe romper la respuesta ya mostrada. */
export async function saveExchange(userId: string, pregunta: string, respuesta: string): Promise<void> {
  await prisma.assistantExchange.create({ data: { userId, pregunta, respuesta } });
}

const DEFAULT_HISTORY_DAYS = 7;

/** Intercambios de un usuario en los últimos `days` días, los más recientes primero. */
export async function getRecentExchanges(
  userId: string,
  days: number = DEFAULT_HISTORY_DAYS,
): Promise<AssistantExchangeRecord[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.assistantExchange.findMany({
    where: { userId, fecha: { gte: since } },
    orderBy: { fecha: "desc" },
  });
}

/**
 * Borra los intercambios de hace más de `olderThanDays` días, de todos los
 * usuarios. La llama el Cron Job semanal de Vercel (ver dashboard/vercel.json)
 * — así esta tabla nunca crece sin límite sin que haga falta gestionarla a
 * mano. No se scopea por usuario a propósito: es limpieza por antigüedad,
 * no una operación que un usuario dispare sobre sus propios datos.
 */
export async function purgeOldExchanges(olderThanDays: number = DEFAULT_HISTORY_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.assistantExchange.deleteMany({ where: { fecha: { lt: cutoff } } });
  return count;
}
