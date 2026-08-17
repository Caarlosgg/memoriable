"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspace";
import { uploadImageToBlob } from "@/lib/blobUpload";
import {
  chatChannelTopic,
  CHAT_NEW_MESSAGE_EVENT,
  supabaseRealtimeUrl,
  supabaseRealtimeAnonKey,
  isSupabaseRealtimeConfigured,
} from "@/lib/chatRealtime";

export interface ChatMessageView {
  id: string;
  texto: string;
  imagenUrl: string | null;
  createdAt: string;
  userId: string;
  email: string;
}

const CHAT_MESSAGES_LIMIT = 50;
const CHAT_TEXTO_MAX_LENGTH = 2000;

/**
 * Avisa por Realtime Broadcast de que hay un mensaje nuevo — canal
 * PÚBLICO (sin `?private=true`, sin políticas RLS que configurar) porque
 * el payload no lleva nada sensible, solo la señal (ver chatRealtime.ts).
 * Best-effort de verdad: si Supabase no está configurado, o la petición
 * falla, el chat sigue funcionando igual vía el sondeo de respaldo del
 * cliente — nunca debe tirar `sendChatMessage`, el mensaje ya está
 * guardado en Postgres cuando se llama a esto.
 */
async function broadcastNewChatMessage(workspaceId: string): Promise<void> {
  if (!isSupabaseRealtimeConfigured()) return;
  try {
    const topic = chatChannelTopic(workspaceId);
    const url = `${supabaseRealtimeUrl()}/realtime/v1/api/broadcast/${topic}/events/${CHAT_NEW_MESSAGE_EVENT}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { apikey: supabaseRealtimeAnonKey()!, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      console.error(`No se pudo avisar por Realtime (HTTP ${res.status}) — hay sondeo de respaldo.`);
    }
  } catch (err) {
    console.error("No se pudo avisar por Realtime de un mensaje nuevo de chat (no crítico, hay sondeo de respaldo):", err);
  }
}

/**
 * Últimos mensajes del chat del workspace activo, o los posteriores a un
 * cursor (`after`, id de un mensaje ya visto) para el sondeo/refresco
 * incremental — evita volver a traer los mismos mensajes en cada sondeo.
 * Vacío en modo personal: no hay con quién hablar (la UI tampoco monta el
 * chat ahí, ver navItems.ts).
 */
export async function listChatMessages(after?: string): Promise<ChatMessageView[]> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return [];

  const cursor = after
    ? await prisma.chatMessage.findUnique({ where: { id: after }, select: { createdAt: true } })
    : null;

  const messages = await prisma.chatMessage.findMany({
    where: {
      workspaceId,
      ...(cursor ? { createdAt: { gt: cursor.createdAt } } : {}),
    },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: cursor ? "asc" : "desc" },
    ...(cursor ? {} : { take: CHAT_MESSAGES_LIMIT }),
  });

  // Sin cursor: se piden las más recientes primero (para el LIMIT) y se
  // devuelven en orden cronológico, como se leen. Con cursor, ya vienen en
  // ese orden (ASC) — no hace falta darles la vuelta.
  const ordered = cursor ? messages : messages.reverse();
  return ordered.map((m) => ({
    id: m.id,
    texto: m.texto,
    imagenUrl: m.imagenUrl,
    createdAt: m.createdAt.toISOString(),
    userId: m.userId,
    email: m.user.email,
  }));
}

export interface SendChatMessageResult {
  error?: string;
  message?: ChatMessageView;
}

/**
 * Inserta el mensaje + avisa por Realtime — compartido entre `sendChatMessage`
 * (el formulario del chat, con sesión) y la tool `enviarMensajeChat` del
 * Asistente (assistantTools.ts), que ya trae `workspaceId`/`userId`
 * resueltos por la propia petición y no pasa por aquí con una sesión de
 * navegador. Un único sitio para no duplicar el guardado + aviso.
 */
export async function postChatMessage(
  workspaceId: string,
  userId: string,
  texto: string,
  imagenUrl?: string | null,
): Promise<SendChatMessageResult> {
  const trimmed = texto.trim();
  if (!trimmed && !imagenUrl) return { error: "Escribe algo o adjunta una imagen antes de enviar." };
  if (trimmed.length > CHAT_TEXTO_MAX_LENGTH) {
    return { error: `El mensaje no puede tener más de ${CHAT_TEXTO_MAX_LENGTH} caracteres.` };
  }

  try {
    const created = await prisma.chatMessage.create({
      data: { texto: trimmed, imagenUrl: imagenUrl || null, userId, workspaceId },
      include: { user: { select: { email: true } } },
    });
    await broadcastNewChatMessage(workspaceId);
    revalidatePath("/chat");
    return {
      message: {
        id: created.id,
        texto: created.texto,
        imagenUrl: created.imagenUrl,
        createdAt: created.createdAt.toISOString(),
        userId: created.userId,
        email: created.user.email,
      },
    };
  } catch (err) {
    console.error("Error al enviar el mensaje de chat:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido enviar. Inténtalo de nuevo." };
  }
}

/**
 * Cualquier miembro ACTIVO puede escribir, INCLUIDO el rol VIEWER — el
 * chat es comunicación con el equipo, no una mutación de contenido del
 * workspace (tareas/notas/eventos), así que no pasa por `canWrite`/
 * `READONLY_ROLE_MESSAGE` (a propósito, distinto del resto de acciones de
 * escritura de esta app).
 */
export async function sendChatMessage(texto: string, imagenUrl?: string | null): Promise<SendChatMessageResult> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return { error: "El chat de equipo no está disponible en tu espacio personal." };
  return postChatMessage(workspaceId, userId, texto, imagenUrl);
}

/** Sube la imagen adjunta de un mensaje de chat a Vercel Blob — sin `canWrite`, mismo criterio que `sendChatMessage`. */
export async function uploadChatImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return { error: "No disponible en tu espacio personal." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se ha recibido ningún fichero." };

  const result = await uploadImageToBlob(`chat/${workspaceId}`, file);
  if (result.error) Sentry.captureMessage(`Fallo al subir imagen de chat: ${result.error}`);
  return result;
}

/** Marca el chat como leído hasta ahora — apaga el indicador de no leído del menú. */
export async function markChatRead(): Promise<void> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return;
  try {
    await prisma.membership.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { lastChatReadAt: new Date() },
    });
  } catch (err) {
    console.error("No se pudo marcar el chat como leído (no crítico):", err);
  }
}

/** Para el indicador de no leído del menú (Sidebar/BottomTabs) — ver layout.tsx. Best-effort: no bloquea la navegación si falla. Silenciar el chat (ver setChatMuted) apaga este indicador sin dejar de poder leer/escribir. */
export async function hasUnreadChat(): Promise<boolean> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return false;
  try {
    const [membership, latest] = await Promise.all([
      prisma.membership.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { lastChatReadAt: true, chatMuted: true },
      }),
      prisma.chatMessage.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    if (!latest || membership?.chatMuted) return false;
    if (!membership?.lastChatReadAt) return true;
    return latest.createdAt > membership.lastChatReadAt;
  } catch (err) {
    console.error("No se pudo comprobar si hay mensajes de chat sin leer (no crítico):", err);
    return false;
  }
}

/** Silencia/reactiva el chat de este workspace para el usuario actual — no afecta a poder leer/escribir, solo al indicador de no leído. */
export async function setChatMuted(muted: boolean): Promise<{ error?: string }> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return { error: "No aplica en tu espacio personal." };
  try {
    await prisma.membership.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { chatMuted: muted },
    });
    return {};
  } catch (err) {
    console.error("No se pudo cambiar el silencio del chat:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar." };
  }
}

/** Estado actual de silencio del chat, para pintar el toggle al cargar /chat. */
export async function getChatMuted(): Promise<boolean> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return false;
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { chatMuted: true },
  });
  return membership?.chatMuted ?? false;
}
