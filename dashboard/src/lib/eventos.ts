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
