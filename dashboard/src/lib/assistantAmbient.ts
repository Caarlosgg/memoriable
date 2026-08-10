import "server-only";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";
import { upcomingRange } from "./calendar";
import { formatEventTime } from "./format";
import type { AmbientStats } from "./assistantContext";

const EVENTOS_PROXIMOS_LIMIT = 3;

/**
 * Cifras "ambientales" del workspace activo para el Asistente (ver
 * buildAmbientBlock en assistantContext.ts): cuántas tareas/recordatorios
 * siguen abiertos y qué eventos hay en los próximos 7 días. Dos consultas
 * baratas (count + un findMany acotado), en paralelo — no bloquea la
 * respuesta si tarda, se resuelve junto al resto de contexto en route.ts.
 */
export async function resolveAmbientStats(workspaceId: string): Promise<AmbientStats> {
  const { desde, hasta } = upcomingRange(7);
  const [pendientesCount, eventosProximos, eventosProximosCount] = await Promise.all([
    prisma.message.count({
      where: { workspaceId, categoria: { in: [...ACTIONABLE_CATEGORIES] }, estado: { not: "HECHO" } },
    }),
    prisma.evento.findMany({
      where: { workspaceId, fechaInicio: { gte: desde, lt: hasta } },
      orderBy: { fechaInicio: "asc" },
      take: EVENTOS_PROXIMOS_LIMIT,
      select: { titulo: true, fechaInicio: true },
    }),
    prisma.evento.count({ where: { workspaceId, fechaInicio: { gte: desde, lt: hasta } } }),
  ]);
  return {
    pendientesCount,
    eventosProximos: eventosProximos.map((e) => ({ titulo: e.titulo, fecha: formatEventTime(e.fechaInicio) })),
    eventosProximosCount,
  };
}

/** Nombre del workspace activo, solo cuando NO es el personal (ver buildWorkspaceContextLine). */
export async function resolveWorkspaceNombre(workspaceId: string): Promise<string | undefined> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { nombre: true } });
  return workspace?.nombre;
}
