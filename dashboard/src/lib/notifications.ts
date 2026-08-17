import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { sendPushToUser } from "./webPush";

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
 *
 * Respeta `User.notificationPrefs` (mapa `NotificationType → boolean`,
 * ausente = activado): si el destinatario ha desactivado ESTE tipo
 * explícitamente, no se crea la fila — mismo criterio "silencioso, no
 * fallido" que el resto de la función.
 *
 * Además de guardarla en la bandeja, intenta un push al navegador (ver
 * lib/webPush.ts) — best-effort de verdad: si falla, la notificación ya
 * está guardada, así que nunca se propaga el error hacia arriba.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { notificationPrefs: true } });
  const prefs = (user?.notificationPrefs ?? {}) as Partial<Record<NotificationType, boolean>>;
  if (prefs[input.type] === false) return;
  await prisma.notification.create({ data: input });
  sendPushToUser(input.userId, { title: input.title, body: input.body, link: input.link }).catch((err) => {
    console.error("No se pudo mandar el push de la notificación (no crítico):", err);
  });
}

/** Notificaciones de un usuario, más recientes primero — bandeja completa (/notificaciones) o la campana (con `limit` bajo). */
export async function listNotifications(userId: string, limit = 20) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
}

/** Para el número en la campana. */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}
