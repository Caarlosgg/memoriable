import "server-only";
import type { Message, Evento } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";

/** Pendientes con más de esto sin tocar cuentan como "atascadas" en el resumen. */
const STUCK_AFTER_DAYS = 5;

export interface DailyBriefingData {
  /** La pendiente más antigua sin hacer, si hay alguna — el foco sugerido del día. */
  misionPrincipal: Pick<Message, "id" | "resumen" | "categoria"> | null;
  eventosHoy: Pick<Evento, "id" | "titulo" | "fechaInicio" | "ubicacion">[];
  totalPendientes: number;
  atascadas: number;
}

/**
 * Resumen del día, calculado directamente de lo guardado (sin IA): más
 * rápido y sin depender de Groq para algo que se muestra en cada login —
 * verificado en esta misma sesión que las llamadas con varios pasos pueden
 * tardar decenas de segundos, inaceptable para un modal que aparece nada
 * más entrar.
 *
 * Fase Equipo: SIEMPRE el workspace personal del usuario (recibido ya
 * resuelto, ver `getPersonalWorkspaceId` en `lib/workspace.ts`), nunca el
 * activo — "tu día" es un ritual personal, no cambia si en ese momento
 * tienes seleccionado un workspace de equipo. Un "resumen del equipo"
 * aparte es una mejora futura, no de esta fase.
 */
export async function getDailyBriefing(personalWorkspaceId: string): Promise<DailyBriefingData> {
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const hoyFin = new Date(hoyInicio);
  hoyFin.setDate(hoyFin.getDate() + 1);

  const [pendientes, eventosHoy] = await Promise.all([
    prisma.message.findMany({
      where: {
        workspaceId: personalWorkspaceId,
        categoria: { in: [...ACTIONABLE_CATEGORIES] },
        estado: { not: "HECHO" },
      },
      orderBy: { fecha: "asc" },
      select: { id: true, resumen: true, categoria: true, fecha: true },
    }),
    prisma.evento.findMany({
      where: { workspaceId: personalWorkspaceId, fechaInicio: { gte: hoyInicio, lt: hoyFin } },
      orderBy: { fechaInicio: "asc" },
      select: { id: true, titulo: true, fechaInicio: true, ubicacion: true },
    }),
  ]);

  const stuckCutoff = new Date(Date.now() - STUCK_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const atascadas = pendientes.filter((p) => p.fecha < stuckCutoff).length;

  return {
    misionPrincipal: pendientes[0] ?? null,
    eventosHoy,
    totalPendientes: pendientes.length,
    atascadas,
  };
}
