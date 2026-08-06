import "server-only";
import { prisma } from "./prisma";
import { titleFromQuestion } from "./conversationTitle";

export interface AssistantExchangeRecord {
  id: string;
  pregunta: string;
  respuesta: string;
  fecha: Date;
}

export interface ConversationSummary {
  id: string;
  titulo: string;
  updatedAt: Date;
}

/**
 * Asegura que existe una conversación utilizable para este usuario y
 * devuelve su id — normalmente el mismo `conversationId` que propone el
 * cliente (generado él mismo al empezar un chat nuevo), salvo que ese id
 * ya pertenezca a OTRO usuario (id ajeno, por error o manipulado): en ese
 * caso se crea una conversación nueva en vez de reutilizar una ajena.
 */
export async function ensureConversation(
  userId: string,
  conversationId: string,
  titleSeed: string,
): Promise<string> {
  const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });

  if (existing) {
    if (existing.userId !== userId) {
      const created = await prisma.conversation.create({
        data: { userId, titulo: titleFromQuestion(titleSeed) },
      });
      return created.id;
    }
    return existing.id;
  }

  const created = await prisma.conversation.create({
    data: { id: conversationId, userId, titulo: titleFromQuestion(titleSeed) },
  });
  return created.id;
}

/** Guarda un intercambio ya completado dentro de una conversación y la marca como recién tocada. */
export async function saveExchange(
  userId: string,
  conversationId: string,
  pregunta: string,
  respuesta: string,
): Promise<void> {
  await prisma.assistantExchange.create({ data: { userId, conversationId, pregunta, respuesta } });
  // No crítico: si esto falla, la conversación solo queda con un
  // `updatedAt` desactualizado (afecta el orden de la lista, nada más).
  await prisma.conversation.update({ where: { id: conversationId }, data: {} }).catch(() => {});
}

/**
 * Conversaciones del usuario, las más recientes (por actividad) primero.
 * Solo las que tienen ya al menos un intercambio guardado: `ensureConversation`
 * crea la fila de `Conversation` ANTES de saber si la respuesta llegará a
 * completarse (p. ej. si Groq falla o la petición no termina) — sin este
 * filtro, esas conversaciones "fantasma" aparecían en la lista con título
 * pero sin nada dentro, y al abrirlas se veían vacías sin explicación.
 */
export async function listConversations(userId: string, limit = 30): Promise<ConversationSummary[]> {
  return prisma.conversation.findMany({
    where: { userId, exchanges: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, titulo: true, updatedAt: true },
  });
}

/** Intercambios de una conversación, en orden cronológico (el más antiguo primero). */
export async function getConversationExchanges(
  userId: string,
  conversationId: string,
): Promise<AssistantExchangeRecord[]> {
  return prisma.assistantExchange.findMany({
    where: { userId, conversationId },
    orderBy: { fecha: "asc" },
  });
}

const DEFAULT_HISTORY_DAYS = 7;

/**
 * Borra los intercambios de hace más de `olderThanDays` días (de todos los
 * usuarios) y las conversaciones que se quedan sin ningún intercambio tras
 * esa purga — así la lista de conversaciones no acumula hilos vacíos. La
 * llama el Cron Job semanal de Vercel (ver dashboard/vercel.json).
 */
export async function purgeOldExchanges(olderThanDays: number = DEFAULT_HISTORY_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.assistantExchange.deleteMany({ where: { fecha: { lt: cutoff } } });
  await prisma.conversation.deleteMany({ where: { exchanges: { none: {} } } });
  return count;
}
