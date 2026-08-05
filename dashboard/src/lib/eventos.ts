import "server-only";
import type { Evento, Message } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";

/** Todos los eventos del usuario (sin límite: uso personal, volumen bajo — ver nota en calendario/page.tsx). */
export async function getAllEventos(userId: string): Promise<Evento[]> {
  return prisma.evento.findMany({ where: { userId }, orderBy: { fechaInicio: "asc" } });
}

/**
 * Tareas/recordatorios "importantes" pendientes (Fase I, resumen tipo
 * diario): prioridad alta y aún sin terminar. Es la mitad "tareas" del
 * resumen — la otra mitad son los `Evento` próximos (ver upcomingRange en
 * calendar.ts, consultados aparte).
 */
export async function getImportantPending(userId: string, limit = 20): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      userId,
      categoria: { in: [...ACTIONABLE_CATEGORIES] },
      estado: { not: "HECHO" },
      prioridad: "ALTA",
    },
    orderBy: { fecha: "desc" },
    take: limit,
  });
}
