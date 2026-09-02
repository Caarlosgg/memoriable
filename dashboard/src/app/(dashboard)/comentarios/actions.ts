"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspace";
import {
  listComentarios as libList,
  createComentario as libCreate,
  updateComentario as libUpdate,
  deleteComentario as libDelete,
  type ComentarioView,
  type ComentarioResult,
} from "@/lib/comentarios";

export type { ComentarioView, ComentarioResult };

/**
 * Comentarios sobre una nota o un evento — la comunicación del equipo vive
 * DENTRO del trabajo (ver el modelo `Comentario` en schema.prisma para el
 * porqué esto sustituyó al chat interno).
 *
 * Un VIEWER SÍ puede comentar, a diferencia del resto de escrituras
 * (`canWrite`): comentar no modifica el trabajo, y un rol de solo lectura que
 * no puede ni responder una pregunta no sirve para colaborar. Lo que sí se
 * comprueba siempre es que la nota/evento sea del workspace activo — así un
 * id de otro espacio no se cuela por aquí.
 */

/** Resuelve el padre y comprueba que es del workspace activo. `null` si no lo es (o no existe). */
async function resolverPadre(
  workspaceId: string,
  messageId?: string,
  eventoId?: string,
): Promise<{ contexto: string; link: string } | null> {
  if (messageId) {
    const nota = await prisma.message.findFirst({
      where: { id: messageId, workspaceId },
      select: { resumen: true },
    });
    return nota ? { contexto: nota.resumen, link: `/notas?mensaje=${messageId}` } : null;
  }
  if (eventoId) {
    const evento = await prisma.evento.findFirst({
      where: { id: eventoId, workspaceId },
      select: { titulo: true },
    });
    return evento ? { contexto: evento.titulo, link: `/calendario?evento=${eventoId}` } : null;
  }
  return null;
}

export async function listComentarios(
  messageId?: string,
  eventoId?: string,
): Promise<ComentarioView[]> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  if (!(await resolverPadre(workspaceId, messageId, eventoId))) return [];

  return libList(messageId ? { messageId } : { eventoId: eventoId! }, userId);
}

export async function createComentario(
  texto: string,
  messageId?: string,
  eventoId?: string,
): Promise<ComentarioResult> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);

  // Exactamente uno de los dos (la base de datos también lo impone con un
  // CHECK, ver la migración) — aquí se traduce a un mensaje entendible.
  if (Boolean(messageId) === Boolean(eventoId)) {
    return { error: "Un comentario va sobre una nota o sobre un evento." };
  }

  const padre = await resolverPadre(workspaceId, messageId, eventoId);
  if (!padre) return { error: "No se ha encontrado eso que quieres comentar." };

  const result = await libCreate({
    target: messageId ? { messageId } : { eventoId: eventoId! },
    workspaceId,
    userId,
    texto,
    contexto: padre.contexto,
    link: padre.link,
  });

  if (!result.error) {
    revalidatePath("/notas");
    revalidatePath("/pendientes");
    revalidatePath("/calendario");
  }
  return result;
}

export async function updateComentario(id: string, texto: string): Promise<{ error?: string }> {
  const userId = await verifySession();
  const result = await libUpdate(id, userId, texto);
  if (!result.error) {
    revalidatePath("/notas");
    revalidatePath("/pendientes");
    revalidatePath("/calendario");
  }
  return result;
}

export async function deleteComentario(id: string): Promise<{ error?: string }> {
  const userId = await verifySession();
  const result = await libDelete(id, userId);
  if (!result.error) {
    revalidatePath("/notas");
    revalidatePath("/pendientes");
    revalidatePath("/calendario");
  }
  return result;
}
