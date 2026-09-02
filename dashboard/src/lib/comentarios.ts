import "server-only";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "./prisma";
import { createNotification } from "./notifications";

export const COMENTARIO_MAX_LENGTH = 2000;

export interface ComentarioView {
  id: string;
  texto: string;
  createdAt: string;
  editadoAt: string | null;
  userId: string;
  email: string;
  /** `true` si lo escribió quien está mirando — el cliente lo usa para decidir si enseña editar/borrar. */
  esMio: boolean;
}

/** Une los dos padres posibles en un solo tipo: un comentario cuelga de una nota O de un evento, nunca de ambos. */
export type ComentarioTarget = { messageId: string } | { eventoId: string };

function targetWhere(target: ComentarioTarget) {
  return "messageId" in target ? { messageId: target.messageId } : { eventoId: target.eventoId };
}

function toView(
  c: {
    id: string;
    texto: string;
    createdAt: Date;
    editadoAt: Date | null;
    userId: string;
    user: { email: string };
  },
  currentUserId: string,
): ComentarioView {
  return {
    id: c.id,
    texto: c.texto,
    createdAt: c.createdAt.toISOString(),
    editadoAt: c.editadoAt?.toISOString() ?? null,
    userId: c.userId,
    email: c.user.email,
    esMio: c.userId === currentUserId,
  };
}

/**
 * Comentarios de una nota o evento, del más antiguo al más nuevo (orden de
 * lectura de un hilo, no de una bandeja).
 *
 * NO comprueba permisos: quien llama ya ha resuelto que el usuario ve esa
 * nota/evento (mismo criterio que `listWorkspaceMembers` en workspace.ts).
 */
export async function listComentarios(
  target: ComentarioTarget,
  currentUserId: string,
): Promise<ComentarioView[]> {
  const rows = await prisma.comentario.findMany({
    where: targetWhere(target),
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true } } },
  });
  return rows.map((c) => toView(c, currentUserId));
}

export interface ComentarioResult {
  error?: string;
  comentario?: ComentarioView;
}

/**
 * Menciones `@alguien` dentro del texto. Se resuelven contra los miembros
 * del workspace por la parte local del email (lo que el resto de la app ya
 * enseña como nombre, ver `shortEmailName` en lib/format.ts) — no contra
 * cualquier usuario del sistema: mencionar a alguien que no está en el
 * equipo no debería avisarle de un trabajo que no puede ver.
 */
function extraerMenciones(texto: string): string[] {
  const matches = texto.matchAll(/@([a-zA-Z0-9._-]+)/g);
  return [...new Set([...matches].map((m) => m[1]!.toLowerCase()))];
}

/**
 * Avisa a los mencionados. Best-effort de verdad: el comentario ya está
 * guardado cuando esto corre, así que un fallo aquí nunca debe propagarse
 * (mismo criterio que `notifyChatParticipants` tenía en el chat).
 */
async function notificarMenciones(params: {
  texto: string;
  workspaceId: string;
  autorId: string;
  autorEmail: string;
  link: string;
  contexto: string;
}): Promise<void> {
  const menciones = extraerMenciones(params.texto);
  if (menciones.length === 0) return;

  const miembros = await prisma.membership.findMany({
    where: { workspaceId: params.workspaceId, status: "ACTIVE" },
    include: { user: { select: { id: true, email: true } } },
  });

  const destinatarios = miembros
    .filter((m) => m.userId !== params.autorId)
    .filter((m) => menciones.includes(m.user.email.split("@")[0]!.toLowerCase()));

  const autor = params.autorEmail.split("@")[0];
  await Promise.all(
    destinatarios.map((m) =>
      createNotification({
        userId: m.userId,
        type: "ASSIGNED_MESSAGE",
        title: `${autor} te ha mencionado`,
        body: params.contexto,
        link: params.link,
      }),
    ),
  );
}

export async function createComentario(params: {
  target: ComentarioTarget;
  workspaceId: string;
  userId: string;
  texto: string;
  /** Para el cuerpo de la notificación de mención — el resumen de la nota o el título del evento. */
  contexto: string;
  link: string;
}): Promise<ComentarioResult> {
  const trimmed = params.texto.trim();
  if (!trimmed) return { error: "Escribe algo antes de comentar." };
  if (trimmed.length > COMENTARIO_MAX_LENGTH) {
    return { error: `El comentario no puede tener más de ${COMENTARIO_MAX_LENGTH} caracteres.` };
  }

  try {
    const created = await prisma.comentario.create({
      data: {
        texto: trimmed,
        userId: params.userId,
        workspaceId: params.workspaceId,
        ...targetWhere(params.target),
      },
      include: { user: { select: { email: true } } },
    });

    // `void` a propósito: el comentario ya está guardado y avisar no debe
    // retrasar la respuesta a quien escribe, ni tumbarla si falla.
    void notificarMenciones({
      texto: trimmed,
      workspaceId: params.workspaceId,
      autorId: params.userId,
      autorEmail: created.user.email,
      link: params.link,
      contexto: params.contexto,
    }).catch((err) => {
      console.error("No se pudieron avisar las menciones (no crítico):", err);
    });

    return { comentario: toView(created, params.userId) };
  } catch (err) {
    console.error("No se pudo crear el comentario:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido publicar el comentario." };
  }
}

/**
 * Editar y borrar solo lo tuyo: el filtro va en el `where` de un
 * `updateMany`/`deleteMany`, nunca en un `if` después de leer — mismo
 * criterio que el resto de escrituras de la app (ver `updateMessage`).
 */
export async function updateComentario(
  id: string,
  userId: string,
  texto: string,
): Promise<{ error?: string }> {
  const trimmed = texto.trim();
  if (!trimmed) return { error: "El comentario no puede quedar vacío." };
  if (trimmed.length > COMENTARIO_MAX_LENGTH) {
    return { error: `El comentario no puede tener más de ${COMENTARIO_MAX_LENGTH} caracteres.` };
  }

  try {
    const { count } = await prisma.comentario.updateMany({
      where: { id, userId },
      data: { texto: trimmed, editadoAt: new Date() },
    });
    if (count === 0) return { error: "Ese comentario no existe o no es tuyo." };
    return {};
  } catch (err) {
    console.error("No se pudo editar el comentario:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar el cambio." };
  }
}

export async function deleteComentario(id: string, userId: string): Promise<{ error?: string }> {
  try {
    const { count } = await prisma.comentario.deleteMany({ where: { id, userId } });
    if (count === 0) return { error: "Ese comentario no existe o no es tuyo." };
    return {};
  } catch (err) {
    console.error("No se pudo borrar el comentario:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar el comentario." };
  }
}

/** Cuántos comentarios tiene cada nota de una lista — para el contador de la tarjeta, en una sola consulta (no N+1). */
export async function contarComentariosPorMensaje(
  messageIds: string[],
): Promise<Map<string, number>> {
  if (messageIds.length === 0) return new Map();
  const grupos = await prisma.comentario.groupBy({
    by: ["messageId"],
    where: { messageId: { in: messageIds } },
    _count: { _all: true },
  });
  return new Map(grupos.filter((g) => g.messageId).map((g) => [g.messageId!, g._count._all]));
}
