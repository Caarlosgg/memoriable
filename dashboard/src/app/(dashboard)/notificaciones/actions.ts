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
