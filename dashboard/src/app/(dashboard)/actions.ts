"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { captureMessage } from "@/lib/pipeline";
import type { StoredMessage } from "@/lib/botPipeline/repository";

/**
 * Marca un mensaje como hecho. Recibe solo el id (no el objeto completo): el
 * cliente le dice al servidor QUÉ cambiar, nunca CÓMO deben quedar los datos.
 */
export async function markDone(id: string): Promise<void> {
  await verifySession();
  await prisma.message.update({ where: { id }, data: { hecho: true } });
  revalidatePath("/");
}

export interface CaptureState {
  error?: string;
  saved?: StoredMessage;
}

/**
 * Captura rápida desde el dashboard: mismo pipeline que el bot de Telegram
 * (categoriza + resume + guarda), ver src/lib/pipeline.ts.
 */
export async function capture(_prev: CaptureState, formData: FormData): Promise<CaptureState> {
  await verifySession();

  const contenido = String(formData.get("contenido") ?? "").trim();
  if (contenido === "") return { error: "Escribe algo antes de guardar." };

  try {
    const saved = await captureMessage(contenido);
    revalidatePath("/");
    return { saved };
  } catch (err) {
    console.error("Error al capturar mensaje desde el dashboard:", err);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}
