import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Crea una notificación (Fase Equipo) — quien llama decide qué hacer si
 * falla (normalmente: registrar el error y seguir, nunca tumbar la acción
 * principal por esto — asignar una tarea debe funcionar aunque avisar
 * falle). Sin canal externo todavía: solo aparece en la campana de la app.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await prisma.notification.create({ data: input });
}

/** Notificaciones de un usuario, más recientes primero — bandeja completa (/notificaciones) o la campana (con `limit` bajo). */
export async function listNotifications(userId: string, limit = 20) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
}

/** Para el número en la campana. */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}
