"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

/** Marca una notificación propia como leída — `updateMany` con userId en el where, mismo criterio de acceso que el resto. */
export async function markAsRead(id: string): Promise<void> {
  const userId = await verifySession();
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  revalidatePath("/notificaciones");
}

export async function markAllAsRead(): Promise<void> {
  const userId = await verifySession();
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  revalidatePath("/notificaciones");
}

/**
 * Devuelve una notificación a "sin leer".
 *
 * Hace falta porque abrir la bandeja las marca leídas al pinchar: sin esto,
 * un aviso que se abre sin tiempo de atenderlo desaparece del contador y no
 * hay forma de volver a dejarlo pendiente — que es justo para lo que sirve
 * una bandeja.
 */
export async function markAsUnread(id: string): Promise<void> {
  const userId = await verifySession();
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: false } });
  revalidatePath("/notificaciones");
}

/** Borra una notificación propia. El `where` lleva userId: un id ajeno no borra nada. */
export async function deleteNotification(id: string): Promise<void> {
  const userId = await verifySession();
  await prisma.notification.deleteMany({ where: { id, userId } });
  revalidatePath("/notificaciones");
}

/**
 * Vacía las ya leídas. Solo las leídas a propósito: "limpiar" no puede
 * llevarse por delante avisos que aún no se han visto.
 */
export async function deleteReadNotifications(): Promise<void> {
  const userId = await verifySession();
  await prisma.notification.deleteMany({ where: { userId, read: true } });
  revalidatePath("/notificaciones");
}
