"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspace";
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
 * Cualquier miembro ACTIVO puede escribir, INCLUIDO el rol VIEWER — el
 * chat es comunicación con el equipo, no una mutación de contenido del
 * workspace (tareas/notas/eventos), así que no pasa por `canWrite`/
 * `READONLY_ROLE_MESSAGE` (a propósito, distinto del resto de acciones de
 * escritura de esta app).
 */
export async function sendChatMessage(texto: string): Promise<SendChatMessageResult> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return { error: "El chat de equipo no está disponible en tu espacio personal." };

  const trimmed = texto.trim();
  if (!trimmed) return { error: "Escribe algo antes de enviar." };
  if (trimmed.length > CHAT_TEXTO_MAX_LENGTH) {
    return { error: `El mensaje no puede tener más de ${CHAT_TEXTO_MAX_LENGTH} caracteres.` };
  }

  try {
    const created = await prisma.chatMessage.create({
      data: { texto: trimmed, userId, workspaceId },
      include: { user: { select: { email: true } } },
    });
    await broadcastNewChatMessage(workspaceId);
    revalidatePath("/chat");
    return {
      message: {
        id: created.id,
        texto: created.texto,
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

/** Para el indicador de no leído del menú (Sidebar/BottomTabs) — ver layout.tsx. Best-effort: no bloquea la navegación si falla. */
export async function hasUnreadChat(): Promise<boolean> {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  if (isPersonal) return false;
  try {
    const [membership, latest] = await Promise.all([
      prisma.membership.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { lastChatReadAt: true },
      }),
      prisma.chatMessage.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    if (!latest) return false;
    if (!membership?.lastChatReadAt) return true;
    return latest.createdAt > membership.lastChatReadAt;
  } catch (err) {
    console.error("No se pudo comprobar si hay mensajes de chat sin leer (no crítico):", err);
    return false;
  }
}
