import "server-only";
import { prisma } from "./prisma";
import { normalizeForMatch } from "./textMatch";

/**
 * Memoria persistente del Asistente: hechos/preferencias cortos que se
 * recuerdan SIEMPRE, distinto de `AssistantExchange` (log de turnos,
 * purgado a los 7 días por el cron semanal). Escopada a (usuario,
 * workspace activo) — un hecho dicho en el equipo de un negocio no se
 * filtra al espacio personal ni a otro equipo (mismo criterio de
 * aislamiento que el resto del esquema, todo cuelga de un workspace).
 */

export interface AssistantMemoryItem {
  id: string;
  hecho: string;
}

/** Tope por (usuario, workspace) — evita que el system prompt crezca sin límite con el tiempo. */
const MAX_MEMORIES = 30;

export async function listAssistantMemories(userId: string, workspaceId: string): Promise<AssistantMemoryItem[]> {
  return prisma.assistantMemory.findMany({
    where: { userId, workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, hecho: true },
  });
}

/**
 * Guarda un hecho nuevo. Si ya hay uno muy parecido (mismo texto
 * normalizado), lo actualiza en vez de duplicarlo — evita que pedir lo
 * mismo dos veces dependa dos hechos casi idénticos.
 */
export async function saveAssistantMemory(userId: string, workspaceId: string, hecho: string): Promise<AssistantMemoryItem> {
  const trimmed = hecho.trim();
  const normalizado = normalizeForMatch(trimmed);
  const existing = await prisma.assistantMemory.findMany({ where: { userId, workspaceId }, select: { id: true, hecho: true } });
  const duplicate = existing.find((m) => normalizeForMatch(m.hecho) === normalizado);
  if (duplicate) {
    return prisma.assistantMemory.update({
      where: { id: duplicate.id },
      data: { hecho: trimmed },
      select: { id: true, hecho: true },
    });
  }

  const created = await prisma.assistantMemory.create({
    data: { userId, workspaceId, hecho: trimmed },
    select: { id: true, hecho: true },
  });

  // Tope suave: si se pasa del límite, se olvida el más antiguo — mejor
  // perder el hecho menos tocado en mucho tiempo que crecer sin fin.
  if (existing.length + 1 > MAX_MEMORIES) {
    const oldest = await prisma.assistantMemory.findFirst({
      where: { userId, workspaceId, id: { not: created.id } },
      orderBy: { updatedAt: "asc" },
      select: { id: true },
    });
    if (oldest) await prisma.assistantMemory.delete({ where: { id: oldest.id } }).catch(() => {});
  }

  return created;
}

/**
 * Olvida un hecho encontrado por descripción libre ("lo de que cierro los
 * jueves antes") — mismo criterio de coincidencia por texto normalizado
 * que `resolverMiembro`/`encontrarTareaPendiente`. Devuelve `false` si no
 * encuentra ninguno parecido, para que la tool pueda decírselo al usuario
 * en vez de fallar en silencio.
 */
export async function forgetAssistantMemory(userId: string, workspaceId: string, descripcion: string): Promise<boolean> {
  const normalizado = normalizeForMatch(descripcion);
  const memories = await prisma.assistantMemory.findMany({ where: { userId, workspaceId }, select: { id: true, hecho: true } });
  const match = memories.find((m) => {
    const n = normalizeForMatch(m.hecho);
    return n.includes(normalizado) || normalizado.includes(n);
  });
  if (!match) return false;
  await prisma.assistantMemory.delete({ where: { id: match.id } });
  return true;
}
