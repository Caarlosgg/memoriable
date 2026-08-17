import "server-only";
import type { Evento, Message } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";

/**
 * Todos los eventos del workspace activo (sin límite: uso personal/de
 * equipo pequeño, volumen bajo — ver nota en calendario/page.tsx). Fase
 * Equipo: alcance por `workspaceId`, no por `userId`.
 */
export async function getAllEventos(workspaceId: string): Promise<Evento[]> {
  return prisma.evento.findMany({ where: { workspaceId }, orderBy: { fechaInicio: "asc" } });
}

/**
 * Tareas/recordatorios con fecha límite, para pintarlos EN el calendario
 * junto a los eventos.
 *
 * Antes el calendario solo mostraba `Evento`, así que una tarea con fecha
 * de entrega no aparecía por ninguna parte del calendario — había que
 * acordarse de mirar el tablero. Son las dos mitades de "qué me toca
 * cuándo", y verlas separadas obligaba a cruzarlas de cabeza.
 *
 * Solo las que siguen pendientes: una tarea ya terminada no es algo que
 * "toque" ese día, y llenaría el mes de ruido. Solo categorías accionables
 * (mismo criterio que el tablero) — una idea con fecha no es una entrega.
 */
export async function getTasksWithDeadline(workspaceId: string): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      workspaceId,
      categoria: { in: [...ACTIONABLE_CATEGORIES] },
      estado: { not: "HECHO" },
      fechaLimite: { not: null },
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
