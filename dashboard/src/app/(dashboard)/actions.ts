"use server";

import { revalidatePath } from "next/cache";
import type { EstadoTarea, Prioridad } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { captureMessage } from "@/lib/pipeline";
import { isCategory } from "@/lib/categories";
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

export interface UpdateMessageInput {
  resumen?: string;
  contenido?: string;
  categoria?: string;
  estado?: EstadoTarea;
  prioridad?: Prioridad;
  etiquetas?: string[];
}

export interface UpdateMessageResult {
  error?: string;
}

/**
 * Edición manual de una nota desde el modal de detalle (Fase B: botones
 * "Guardar"/"Cancelar" explícitos, nada de autosave). Mismo criterio de
 * dueño que updateTaskStatus/updateTaskPriority: `updateMany` con userId en
 * el where, nunca `update` por id solo.
 */
export async function updateMessage(id: string, input: UpdateMessageInput): Promise<UpdateMessageResult> {
  const userId = await verifySession();

  const resumen = input.resumen?.trim();
  const contenido = input.contenido?.trim();
  if (resumen !== undefined && resumen === "") return { error: "El resumen no puede quedar vacío." };
  if (contenido !== undefined && contenido === "") return { error: "El contenido no puede quedar vacío." };
  if (input.categoria !== undefined && !isCategory(input.categoria)) {
    return { error: "Esa categoría no existe." };
  }

  try {
    const result = await prisma.message.updateMany({
      where: { id, userId },
      data: {
        ...(resumen !== undefined ? { resumen } : {}),
        ...(contenido !== undefined ? { contenido } : {}),
        ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
        ...(input.estado !== undefined ? { estado: input.estado, hecho: input.estado === "HECHO" } : {}),
        ...(input.prioridad !== undefined ? { prioridad: input.prioridad } : {}),
        ...(input.etiquetas !== undefined ? { etiquetas: input.etiquetas } : {}),
      },
    });
    if (result.count === 0) return { error: "No se ha encontrado la nota." };

    revalidatePath("/categorias");
    revalidatePath("/pendientes");
    return {};
  } catch (err) {
    console.error("Error al editar la nota:", err);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
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
