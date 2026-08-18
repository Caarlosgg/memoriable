import "server-only";
import type { Evento, Message } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";

/**
 * Eventos que caen (o siguen abiertos) dentro de un rango. Un evento de
 * varios días cuenta si SOLAPA el rango, no solo si empieza dentro — si
 * no, una actividad que arranca en enero y acaba en marzo desaparecería
 * al mirar febrero.
 */
export async function getEventosEnRango(workspaceId: string, desde: Date, hasta: Date): Promise<Evento[]> {
  return prisma.evento.findMany({
    where: {
      workspaceId,
      fechaInicio: { lt: hasta },
      OR: [{ fechaFin: null, fechaInicio: { gte: desde } }, { fechaFin: { gte: desde } }],
    },
    orderBy: { fechaInicio: "asc" },
  });
}

/** Como `getTasksWithDeadline`, pero acotado al rango que se está viendo. */
export async function getTasksEnRango(workspaceId: string, desde: Date, hasta: Date): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      workspaceId,
      categoria: { in: [...ACTIONABLE_CATEGORIES] },
      estado: { not: "HECHO" },
      fechaLimite: { gte: desde, lt: hasta },
    },
    orderBy: { fechaLimite: "asc" },
  });
}

/**
 * Tareas/recordatorios "importantes" pendientes (Fase I, resumen tipo
 * diario): prioridad alta y aún sin terminar. Es la mitad "tareas" del
 * resumen — la otra mitad son los `Evento` próximos (ver upcomingRange en
 * calendar.ts, consultados aparte). Fase Equipo: alcance por `workspaceId`.
 */
export async function getImportantPending(workspaceId: string, limit = 20): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      workspaceId,
      categoria: { in: [...ACTIONABLE_CATEGORIES] },
      estado: { not: "HECHO" },
      prioridad: "ALTA",
    },
    orderBy: { fecha: "desc" },
    take: limit,
  });
}
