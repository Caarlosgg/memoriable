"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type { EstadoTarea, Prioridad, Prisma } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { captureMessage } from "@/lib/pipeline";
import { isCategory } from "@/lib/categories";
import { shouldClearEnProgreso } from "@/lib/kanban";
import { searchAcrossAll, type QuickSearchResult } from "@/lib/quickSearch";
import { getActiveWorkspace, isActiveMember, canWrite, READONLY_ROLE_MESSAGE } from "@/lib/workspace";
import { createNotification } from "@/lib/notifications";
import type { StoredMessage } from "@/lib/botPipeline/repository";
import { campoTemplateToArray, campoTemplateToJson, type CampoTemplateField } from "@/lib/campoTemplates";
import { uploadImageToBlob } from "@/lib/blobUpload";

/**
 * Al marcar HECHA una tarjeta (o al cambiarla a una categoría que deja de
 * ser accionable — ver `shouldClearEnProgreso`), "en curso ahora" deja de
 * tener sentido — se limpia sola, igual que desaparecería de una lista de
 * seguimiento en vivo cualquier tarea ya terminada. Un único sitio para no
 * repetir este `if` en cada Server Action que puede llevar una tarjeta ahí.
 */
function clearEnProgresoIfDone(estado?: EstadoTarea, categoria?: string): Prisma.MessageUncheckedUpdateManyInput {
  return shouldClearEnProgreso(estado, categoria) ? { enProgresoPorId: null, enProgresoDesde: null } : {};
}

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
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  await prisma.message.updateMany({
    where: { id, workspaceId },
    data: { estado, hecho: estado === "HECHO", ...clearEnProgresoIfDone(estado) },
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
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  await prisma.message.updateMany({
    where: { id, workspaceId },
    data: { estado, hecho: estado === "HECHO", orden, ...clearEnProgresoIfDone(estado) },
  });
  revalidatePath("/pendientes");
}

/** Cambia la prioridad de una tarjeta del tablero. Mismo criterio de acceso que arriba. */
export async function updateTaskPriority(id: string, prioridad: Prioridad): Promise<void> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  await prisma.message.updateMany({ where: { id, workspaceId }, data: { prioridad } });
  revalidatePath("/pendientes");
}

/**
 * Aplaza (o quita, con `fechaLimite: null`) la fecha límite de una tarjeta
 * del tablero — la acción rápida "Aplazar" de la tarjeta, sin pasar por el
 * modal de edición completo. Mismo criterio de acceso que el resto:
 * `updateMany` con `workspaceId` en el where.
 */
export async function postponeMessage(id: string, fechaLimite: Date | null): Promise<void> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  await prisma.message.updateMany({ where: { id, workspaceId }, data: { fechaLimite } });
  revalidatePath("/pendientes");
}

/**
 * "Empezar" una tarjeta: te marca como quien está trabajando en ella AHORA
 * MISMO (visible para el resto del equipo, ver `listEnProgresoAhora`), y de
 * paso la mueve a EN_PROGRESO — no tiene sentido estar "en curso" en una
 * columna distinta. Cualquiera puede empezar una tarjeta asignada a otro o
 * sin asignar (asignación = quién la tiene encargada; esto = quién la está
 * haciendo AHORA, dos cosas distintas — ver el comentario del campo en el
 * esquema).
 */
export async function startWorkingOn(id: string): Promise<void> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  await prisma.message.updateMany({
    where: { id, workspaceId },
    data: { enProgresoPorId: userId, enProgresoDesde: new Date(), estado: "EN_PROGRESO" },
  });
  revalidatePath("/pendientes");
}

/**
 * Suelta una tarjeta "en curso" sin cambiar su columna — quien la soltó
 * puede retomarla luego, u otro puede empezarla. Cualquier miembro con
 * permiso de escritura puede soltarla (no solo quien la empezó): una
 * tarjeta que se quedó "en curso" porque alguien cerró el portátil sin
 * soltarla no debe quedar bloqueada para el resto del equipo.
 */
export async function stopWorkingOn(id: string): Promise<void> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  await prisma.message.updateMany({
    where: { id, workspaceId },
    data: { enProgresoPorId: null, enProgresoDesde: null },
  });
  revalidatePath("/pendientes");
}

export interface EnProgresoItem {
  id: string;
  resumen: string;
  categoria: string;
  enProgresoPorId: string;
  enProgresoDesde: string;
}

/**
 * Quién está trabajando en qué, AHORA MISMO, en el workspace activo — la
 * fuente de datos del sondeo corto desde el cliente (`CurrentTaskBar`,
 * ver su comentario para el porqué de sondeo y no WebSocket/SSE). Lectura
 * pura: cualquier rol (incluido VIEWER) puede verla.
 */
export async function listEnProgresoAhora(): Promise<EnProgresoItem[]> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const rows = await prisma.message.findMany({
    where: { workspaceId, enProgresoPorId: { not: null } },
    select: { id: true, resumen: true, categoria: true, enProgresoPorId: true, enProgresoDesde: true },
    orderBy: { enProgresoDesde: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    resumen: r.resumen,
    categoria: r.categoria,
    enProgresoPorId: r.enProgresoPorId!,
    enProgresoDesde: r.enProgresoDesde!.toISOString(),
  }));
}

export interface AssignTaskResult {
  error?: string;
}

/**
 * Asigna (o quita, con `assigneeId: null`) una tarjeta del tablero a un
 * miembro del workspace activo. `assigneeId` debe ser siempre un miembro
 * ACTIVE del MISMO workspace — asignar a alguien fuera de él (o con una
 * invitación aún sin aceptar) le dejaría una tarea que nunca vería. Mismo
 * criterio de acceso de escritura que el resto: `updateMany` con
 * `workspaceId` en el where.
 */
export async function assignMessage(id: string, assigneeId: string | null): Promise<AssignTaskResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  if (assigneeId && !(await isActiveMember(assigneeId, workspaceId))) {
    return { error: "Esa persona no es miembro de este workspace." };
  }

  try {
    const result = await prisma.message.updateMany({ where: { id, workspaceId }, data: { assigneeId } });
    if (result.count === 0) return { error: "No se ha encontrado la nota." };
    revalidatePath("/pendientes");

    // No crítico: la tarea ya está asignada, avisar es un extra. Nunca a
    // uno mismo (asignarte tu propia tarea no es noticia).
    if (assigneeId && assigneeId !== userId) {
      notifyMessageAssignment(assigneeId, id).catch((err) => {
        console.error("No se pudo crear la notificación de asignación (no crítico):", err);
      });
    }

    return {};
  } catch (err) {
    console.error("Error al asignar la tarea:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido asignar. Inténtalo de nuevo." };
  }
}

/** Notifica a quien se le ha asignado una tarea — busca el resumen real para que la notificación diga algo útil. */
async function notifyMessageAssignment(assigneeId: string, messageId: string): Promise<void> {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { resumen: true } });
  if (!message) return;
  await createNotification({
    userId: assigneeId,
    type: "ASSIGNED_MESSAGE",
    title: "Te han asignado una tarea",
    body: message.resumen,
    link: `/categorias?mensaje=${messageId}#mensaje-${messageId}`,
  });
}

export interface UpdateMessageInput {
  resumen?: string;
  contenido?: string;
  categoria?: string;
  estado?: EstadoTarea;
  prioridad?: Prioridad;
  etiquetas?: string[];
  camposExtra?: Prisma.InputJsonValue;
  checklist?: Prisma.InputJsonValue;
  imagenes?: string[];
  /** `null` para quitar la fecha límite. `undefined` para no tocarla. */
  fechaLimite?: Date | null;
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
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

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
        ...(input.checklist !== undefined ? { checklist: input.checklist } : {}),
        ...(input.imagenes !== undefined ? { imagenes: input.imagenes } : {}),
        ...(input.fechaLimite !== undefined ? { fechaLimite: input.fechaLimite } : {}),
        // Aparte del `if` de arriba: se limpia también si SOLO cambia la
        // categoría (sin tocar el estado) a una no accionable — antes esto
        // se comprobaba solo dentro del bloque de `estado`, así que
        // cambiar nada más que la categoría dejaba una tarjeta huérfana
        // "en curso" para siempre, sin forma de soltarla desde el tablero.
        ...clearEnProgresoIfDone(input.estado, input.categoria),
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
  const { role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se ha recibido ningún fichero." };

  const result = await uploadImageToBlob(`notas/${userId}`, file);
  if (result.error) Sentry.captureMessage(`Fallo al subir imagen de nota: ${result.error}`);
  return result;
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
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };
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
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

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

/**
 * Plantilla de campos personalizados guardada para esta categoría en el
 * workspace activo (ver campoTemplates.ts) — array vacío si no hay
 * ninguna guardada todavía, nunca lanza. Pensada para el botón "Aplicar
 * plantilla" de MessageDetailDialog.
 */
export async function getCampoTemplate(categoria: string): Promise<CampoTemplateField[]> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const template = await prisma.campoTemplate.findUnique({
    where: { workspaceId_categoria: { workspaceId, categoria } },
    select: { campos: true },
  });
  return template ? campoTemplateToArray(template.campos) : [];
}

export interface SaveCampoTemplateResult {
  error?: string;
}

/**
 * Guarda (o reemplaza entera) la plantilla de campos de esta categoría en
 * el workspace activo — solo nombre + tipo, nunca el valor concreto de la
 * nota desde la que se guardó. Botón "Guardar como plantilla".
 */
export async function saveCampoTemplate(
  categoria: string,
  campos: CampoTemplateField[],
): Promise<SaveCampoTemplateResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };
  const campoJson = campoTemplateToJson(campos);
  if (Object.keys(campoJson).length === 0) return { error: "Añade al menos un campo antes de guardar la plantilla." };

  try {
    await prisma.campoTemplate.upsert({
      where: { workspaceId_categoria: { workspaceId, categoria } },
      create: { workspaceId, categoria, campos: campoJson },
      update: { campos: campoJson },
    });
    return {};
  } catch (err) {
    console.error("Error al guardar la plantilla de campos:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar la plantilla. Inténtalo de nuevo." };
  }
}
