"use server";

import { revalidatePath } from "next/cache";
import type { EstadoTarea, Prioridad } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { captureMessage } from "@/lib/pipeline";
import type { StoredMessage } from "@/lib/botPipeline/repository";

/**
 * Mueve una tarjeta del tablero a otra columna. `hecho` se mantiene
 * sincronizado con `estado` (hecho = estado === HECHO): el bot y el resumen
 * diario siguen leyendo `hecho` tal cual, sin saber nada del tablero.
 *
 * `updateMany` con userId en el where (no `update` por id solo): si el id
 * pertenece a otro usuario, esto no actualiza nada en vez de tocar una nota
 * ajena — la comprobación de dueño va en la propia query.
 */
export async function updateTaskStatus(id: string, estado: EstadoTarea): Promise<void> {
  const userId = await verifySession();
  await prisma.message.updateMany({
    where: { id, userId },
    data: { estado, hecho: estado === "HECHO" },
  });
  revalidatePath("/pendientes");
}

/** Cambia la prioridad de una tarjeta del tablero. Mismo criterio de dueño que arriba. */
export async function updateTaskPriority(id: string, prioridad: Prioridad): Promise<void> {
  const userId = await verifySession();
  await prisma.message.updateMany({ where: { id, userId }, data: { prioridad } });
  revalidatePath("/pendientes");
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
  const userId = await verifySession();

  const contenido = String(formData.get("contenido") ?? "").trim();
  if (contenido === "") return { error: "Escribe algo antes de guardar." };

  try {
    const saved = await captureMessage(userId, contenido);
    revalidatePath("/");
    return { saved };
  } catch (err) {
    console.error("Error al capturar mensaje desde el dashboard:", err);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}
