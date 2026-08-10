"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { put } from "@vercel/blob";
import type { EstadoTarea, Prioridad, Prisma } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { captureMessage } from "@/lib/pipeline";
import { isCategory } from "@/lib/categories";
import { searchAcrossAll, type QuickSearchResult } from "@/lib/quickSearch";
import { getActiveWorkspace } from "@/lib/workspace";
import type { StoredMessage } from "@/lib/botPipeline/repository";

/**
 * Mueve una tarjeta del tablero a otra columna. `hecho` se mantiene
 * sincronizado con `estado` (hecho = estado === HECHO): el bot y el resumen
 * diario siguen leyendo `hecho` tal cual, sin saber nada del tablero.
 *
 * `updateMany` con workspaceId en el where (no `update` por id solo): si el
 * id no pertenece al workspace activo, esto no actualiza nada en vez de
 * tocar una nota ajena — la comprobación de acceso va en la propia query.
 * Fase Equipo: se filtra por `workspaceId`, NO por `userId` — dentro de un
 * workspace de equipo, cualquier miembro puede mover una tarjeta que le
 * han asignado aunque no la haya creado él (ver getActiveWorkspace).
 */
export async function updateTaskStatus(id: string, estado: EstadoTarea): Promise<void> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  await prisma.message.updateMany({
    where: { id, workspaceId },
    data: { estado, hecho: estado === "HECHO" },
  });
  revalidatePath("/pendientes");
}

/**
 * Mueve una tarjeta a una columna Y posición concretas dentro de ella (el
 * resultado de soltarla al arrastrar). `orden` ya viene calculado por el
 * cliente (punto medio entre las dos tarjetas vecinas en el destino, o un
 * valor por encima/debajo si se suelta en un extremo) — aquí solo se
 * persiste, junto con el cambio de columna si lo hay. Mismo criterio de
 * acceso que el resto: `updateMany` con workspaceId en el where.
 */
export async function moveTask(id: string, estado: EstadoTarea, orden: number): Promise<void> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  await prisma.message.updateMany({
    where: { id, workspaceId },
    data: { estado, hecho: estado === "HECHO", orden },
  });
  revalidatePath("/pendientes");
}

/** Cambia la prioridad de una tarjeta del tablero. Mismo criterio de acceso que arriba. */
export async function updateTaskPriority(id: string, prioridad: Prioridad): Promise<void> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  await prisma.message.updateMany({ where: { id, workspaceId }, data: { prioridad } });
  revalidatePath("/pendientes");
}

export interface UpdateMessageInput {
  resumen?: string;
  contenido?: string;
  categoria?: string;
  estado?: EstadoTarea;
  prioridad?: Prioridad;
  etiquetas?: string[];
  camposExtra?: Prisma.InputJsonValue;
  imagenes?: string[];
}

export interface UpdateMessageResult {
  error?: string;
}

/**
 * Edición manual de una nota desde el modal de detalle (Fase B: botones
 * "Guardar"/"Cancelar" explícitos, nada de autosave). Mismo criterio de
 * acceso que updateTaskStatus/updateTaskPriority: `updateMany` con
 * workspaceId en el where, nunca `update` por id solo.
 */
export async function updateMessage(id: string, input: UpdateMessageInput): Promise<UpdateMessageResult> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);

  const resumen = input.resumen?.trim();
  const contenido = input.contenido?.trim();
  if (resumen !== undefined && resumen === "") return { error: "El resumen no puede quedar vacío." };
  if (contenido !== undefined && contenido === "") return { error: "El contenido no puede quedar vacío." };
  if (input.categoria !== undefined && !isCategory(input.categoria)) {
    return { error: "Esa categoría no existe." };
  }

  try {
    const result = await prisma.message.updateMany({
      where: { id, workspaceId },
      data: {
        ...(resumen !== undefined ? { resumen } : {}),
        ...(contenido !== undefined ? { contenido } : {}),
        ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
        ...(input.estado !== undefined ? { estado: input.estado, hecho: input.estado === "HECHO" } : {}),
        ...(input.prioridad !== undefined ? { prioridad: input.prioridad } : {}),
        ...(input.etiquetas !== undefined ? { etiquetas: input.etiquetas } : {}),
        ...(input.camposExtra !== undefined ? { camposExtra: input.camposExtra } : {}),
        ...(input.imagenes !== undefined ? { imagenes: input.imagenes } : {}),
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

export interface UploadImageResult {
  url?: string;
  error?: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Sube una imagen adjunta a una nota (Fase D) a Vercel Blob y devuelve su
 * URL pública — el propio dueño la añade a `imagenes` con `updateMessage`
 * (esto solo sube el fichero, no toca la nota). Sin `BLOB_READ_WRITE_TOKEN`
 * configurada, `put()` lanza — se captura y se devuelve un error legible en
 * vez de una excepción cruda, mismo criterio que el resto de integraciones
 * opcionales (Groq/Gemini/Sentry).
 */
export async function uploadImage(formData: FormData): Promise<UploadImageResult> {
  const userId = await verifySession();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se ha recibido ningún fichero." };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "Solo se admiten imágenes (PNG, JPEG, WEBP o GIF)." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "La imagen pesa demasiado (máx. 8 MB)." };
  }

  try {
    const extension = file.type.split("/")[1];
    const blob = await put(`notas/${userId}/${randomUUID()}.${extension}`, file, { access: "public" });
    return { url: blob.url };
  } catch (err) {
    console.error("Error al subir la imagen a Vercel Blob:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido subir la imagen. Inténtalo de nuevo en un momento." };
  }
}

export interface DeleteMessageResult {
  error?: string;
}

/**
 * Borra una nota/tarea. Mismo criterio de acceso que el resto: `deleteMany`
 * con workspaceId en el where. El margen de deshacer (unos segundos antes
 * de llamar a esto de verdad) vive en el cliente, ver UndoToast.tsx — esta
 * acción SIEMPRE borra de verdad, no sabe nada de "deshacer".
 */
export async function deleteMessage(id: string): Promise<DeleteMessageResult> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  try {
    const result = await prisma.message.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) return { error: "No se ha encontrado la nota." };
    revalidatePath("/categorias");
    revalidatePath("/pendientes");
    return {};
  } catch (err) {
    console.error("Error al borrar la nota:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar. Puede que tenga un evento del calendario enlazado." };
  }
}

/** Búsqueda de la paleta de comandos (Ctrl/Cmd+K) — ver lib/quickSearch.ts. */
export async function quickSearch(query: string): Promise<QuickSearchResult[]> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  return searchAcrossAll(userId, workspaceId, isPersonal, query);
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
  const { workspaceId } = await getActiveWorkspace(userId);

  const contenido = String(formData.get("contenido") ?? "").trim();
  if (contenido === "") return { error: "Escribe algo antes de guardar." };

  try {
    const saved = await captureMessage(userId, contenido, workspaceId);
    revalidatePath("/");
    return { saved };
  } catch (err) {
    console.error("Error al capturar mensaje desde el dashboard:", err);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}
