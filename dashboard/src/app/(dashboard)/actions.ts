"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

/**
 * Marca un mensaje como hecho. Recibe solo el id (no el objeto completo): el
 * cliente le dice al servidor QUÉ cambiar, nunca CÓMO deben quedar los datos.
 */
export async function markDone(id: string): Promise<void> {
  await verifySession();
  await prisma.message.update({ where: { id }, data: { hecho: true } });
  revalidatePath("/");
}
