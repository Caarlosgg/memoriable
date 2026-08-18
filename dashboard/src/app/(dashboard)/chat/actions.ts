"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type { ChatConversationType, MemberPresence } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { uploadImageToBlob } from "@/lib/blobUpload";
import { notifyChatParticipants } from "@/lib/chatNotifications";
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

export interface ConversationParticipantInfo {
  userId: string;
  email: string;
  /** Estado manual ("Ocupado"/"Fuera") de la membresía de equipo más reciente de esta persona — null si no comparte ningún equipo contigo o no lo ha puesto nunca. */
  presenceStatus: MemberPresence | null;
  lastSeenAt: string | null;
}

export interface ConversationView {
  id: string;
  type: ChatConversationType;
  /** Nombre a mostrar: el propio del grupo, o el email del otro participante en una individual. */
  nombre: string;
  /** Nombre del equipo, SOLO en el grupo automático de un workspace — null en todo lo personal (ver ChatConversation en el schema). */
  equipo: string | null;
  /** Solo DIRECT — para encontrar sus datos dentro de `participants`. */
  otherUserId: string | null;
  lastMessage: { texto: string; imagenUrl: string | null; createdAt: string; userId: string } | null;
  /** Cuántos mensajes sin leer (0 = ninguno) — un número, no un punto: saber si son 2 o 40 cambia si abres ahora o luego. */
  unreadCount: number;
  muted: boolean;
  /** Quiénes están dentro, con lo necesario para pintar avatar/presencia — ya no depende de la lista de miembros de un workspace concreto (el chat es del usuario, no de un equipo). */
  participants: ConversationParticipantInfo[];
}

export interface UserSearchResult {
  userId: string;
  email: string;
}

const CHAT_MESSAGES_LIMIT = 50;
const CHAT_TEXTO_MAX_LENGTH = 2000;
const MAX_GROUP_NAME_LENGTH = 40;
const SEARCH_USERS_LIMIT = 8;
const SEARCH_USERS_MIN_LENGTH = 2;

/**
 * Avisa por Realtime Broadcast de que hay un mensaje nuevo en una
 * conversación concreta — canal PÚBLICO (sin políticas RLS que configurar)
 * porque el payload no lleva nada sensible, solo la señal (ver
 * chatRealtime.ts). Best-effort: si Supabase no está configurado, o la
 * petición falla, el chat sigue funcionando vía el sondeo de respaldo del
 * cliente — nunca debe tirar la escritura, el mensaje ya está en Postgres.
 */
async function broadcastNewChatMessage(conversationId: string): Promise<void> {
  if (!isSupabaseRealtimeConfigured()) return;
  try {
    const topic = chatChannelTopic(conversationId);
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

/** Conversación + a qué workspace/tipo pertenece, SOLO si `userId` es de verdad participante — null si no, o si no existe. `workspaceId` es null en toda conversación personal (DIRECT, o GROUP creado a mano). */
async function requireParticipant(
  conversationId: string,
  userId: string,
): Promise<{ id: string; workspaceId: string | null; type: ChatConversationType } | null> {
  const participant = await prisma.chatConversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { conversation: { select: { id: true, workspaceId: true, type: true } } },
  });
  return participant?.conversation ?? null;
}

/**
 * Presencia "global" de un conjunto de personas: como el estado manual
 * (Disponible/Ocupado/Fuera) y el último latido viven en `Membership` —por
 * workspace—, y el chat ya no está atado a uno solo, se toma la membresía
 * ACTIVA con el `lastSeenAt` más reciente de cada persona como su estado
 * "actual". Aproximación razonable (el sitio donde ha estado activa hace
 * menos tiempo), no exacta si trabaja en dos equipos a la vez.
 */
async function getGlobalPresence(
  userIds: string[],
): Promise<Map<string, { presenceStatus: MemberPresence | null; lastSeenAt: Date | null }>> {
  if (userIds.length === 0) return new Map();
  const memberships = await prisma.membership.findMany({
    where: { userId: { in: userIds }, status: "ACTIVE" },
    select: { userId: true, presenceStatus: true, lastSeenAt: true },
  });
  const map = new Map<string, { presenceStatus: MemberPresence | null; lastSeenAt: Date | null }>();
  for (const m of memberships) {
    const existing = map.get(m.userId);
    if (!existing || (m.lastSeenAt && (!existing.lastSeenAt || m.lastSeenAt > existing.lastSeenAt))) {
      map.set(m.userId, { presenceStatus: m.presenceStatus, lastSeenAt: m.lastSeenAt });
    }
  }
  return map;
}

/**
 * La conversación de grupo "Equipo" que siempre existe en un workspace de
 * equipo — autocreada al primer acceso (o heredada del antiguo canal único
 * vía migración, ver 20260817140000_chat_conversations). Es la ÚNICA
 * conversación que sigue atada a un workspace (el resto son personales, ver
 * ChatConversation en el schema): sirve de destino por defecto cuando hace
 * falta escribir "al equipo" sin elegir conversación (la tool del
 * Asistente `enviarMensajeChat`), y garantiza que cada equipo tenga su
 * grupo. Idempotente: reutiliza la existente, y de paso afilia a `userId`
 * si todavía no era participante (alguien añadido al equipo después de que
 * se creara el grupo) — cualquier miembro ACTIVO pertenece al grupo del
 * equipo, sin tener que unirse a mano.
 */
export async function ensureDefaultGroupConversation(workspaceId: string, userId: string): Promise<string> {
  const existing = await prisma.chatConversation.findFirst({
    where: { workspaceId, type: "GROUP", nombre: "Equipo" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    await prisma.chatConversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: existing.id, userId } },
      update: {},
      create: { conversationId: existing.id, userId },
    });
    return existing.id;
  }

  const memberships = await prisma.membership.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { userId: true } });
  const participantIds = new Set(memberships.map((m) => m.userId));
  participantIds.add(userId);
  const created = await prisma.chatConversation.create({
    data: {
      type: "GROUP",
      nombre: "Equipo",
      workspaceId,
      createdById: userId,
      participants: { create: [...participantIds].map((id) => ({ userId: id })) },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Todas las conversaciones del usuario: sus DIRECT y GROUP personales (de
 * cualquier equipo o de ninguno — el chat es suyo, no del workspace activo,
 * ver ChatConversation en el schema) MÁS el grupo "Equipo" de cada equipo
 * del que sea miembro ACTIVO ahora mismo. Ya no depende de qué workspace
 * tenga seleccionado el selector de arriba, ni desaparece en el espacio
 * personal.
 */
export async function listConversations(): Promise<ConversationView[]> {
  const userId = await verifySession();

  const teamWorkspaceIds = (
    await prisma.membership.findMany({
      where: { userId, status: "ACTIVE", workspace: { personal: false } },
      select: { workspaceId: true },
    })
  ).map((m) => m.workspaceId);
  await Promise.all(teamWorkspaceIds.map((wsId) => ensureDefaultGroupConversation(wsId, userId)));

  const participations = await prisma.chatConversationParticipant.findMany({
    where: { userId },
    select: {
      lastReadAt: true,
      muted: true,
      conversation: {
        select: {
          id: true,
          type: true,
          nombre: true,
          // De qué equipo es, si es el grupo automático de uno. Sin esto,
          // los grupos "Equipo" de tres equipos distintos se veían los tres
          // como "Equipo", sin forma de saber en cuál estabas escribiendo.
          workspace: { select: { nombre: true } },
          participants: { select: { userId: true, user: { select: { email: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { texto: true, imagenUrl: true, createdAt: true, userId: true } },
        },
      },
    },
  });

  // Contar sin leer solo donde ya se sabe que hay algo nuevo (el último
  // mensaje es posterior a la última lectura, y no es tuyo): así el conteo
  // cuesta UNA consulta agrupada, y solo cuando de verdad hay algo — no una
  // por conversación ni un recuento completo cada vez que se abre /chat.
  const conPendientes = participations.filter(({ conversation, lastReadAt, muted }) => {
    const last = conversation.messages[0];
    return !muted && last != null && last.userId !== userId && (!lastReadAt || last.createdAt > lastReadAt);
  });

  const unreadPorConversacion = new Map<string, number>();
  if (conPendientes.length > 0) {
    const grupos = await prisma.chatMessage.groupBy({
      by: ["conversationId"],
      where: {
        // Los propios nunca cuentan como "sin leer": los acabas de escribir tú.
        userId: { not: userId },
        OR: conPendientes.map(({ conversation, lastReadAt }) => ({
          conversationId: conversation.id,
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        })),
      },
      _count: { _all: true },
    });
    for (const g of grupos) unreadPorConversacion.set(g.conversationId, g._count._all);
  }

  const allParticipantIds = [...new Set(participations.flatMap(({ conversation }) => conversation.participants.map((p) => p.userId)))];
  const presenceMap = await getGlobalPresence(allParticipantIds);

  // `lastReadAt` ya no hace falta aquí: el conteo de sin leer se resolvió
  // arriba de una vez para todas las conversaciones.
  const views = participations.map(({ conversation, muted }): ConversationView => {
    const lastMessage = conversation.messages[0] ?? null;
    const otherParticipant =
      conversation.type === "DIRECT" ? conversation.participants.find((p) => p.userId !== userId) : undefined;
    const nombre =
      conversation.type === "GROUP" ? (conversation.nombre ?? "Grupo") : (otherParticipant?.user.email ?? "Conversación");
    return {
      id: conversation.id,
      type: conversation.type,
      nombre,
      equipo: conversation.workspace?.nombre ?? null,
      otherUserId: otherParticipant?.userId ?? null,
      lastMessage: lastMessage
        ? { texto: lastMessage.texto, imagenUrl: lastMessage.imagenUrl, createdAt: lastMessage.createdAt.toISOString(), userId: lastMessage.userId }
        : null,
      unreadCount: muted ? 0 : (unreadPorConversacion.get(conversation.id) ?? 0),
      muted,
      participants: conversation.participants.map((p) => ({
        userId: p.userId,
        email: p.user.email,
        presenceStatus: presenceMap.get(p.userId)?.presenceStatus ?? null,
        lastSeenAt: presenceMap.get(p.userId)?.lastSeenAt?.toISOString() ?? null,
      })),
    };
  });

  // Más reciente primero — sin mensajes (grupo recién creado) al final.
  return views.sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
}

/**
 * Busca personas con cuenta en MemorIAble por email, para invitar a un chat
 * — a propósito SIN filtrar por equipo: se puede hablar con cualquiera que
 * tenga la app, sea o no compañero (ver el comentario de ChatConversation
 * en el schema). Excluye al propio usuario y las cuentas corporativas aún
 * pendientes de activar (no han entrado nunca, invitarlas a un chat no
 * tendría con quién hablar todavía).
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const userId = await verifySession();
  const trimmed = query.trim();
  if (trimmed.length < SEARCH_USERS_MIN_LENGTH) return [];

  const users = await prisma.user.findMany({
    where: { id: { not: userId }, accountPending: false, email: { contains: trimmed, mode: "insensitive" } },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
    take: SEARCH_USERS_LIMIT,
  });
  return users.map((u) => ({ userId: u.id, email: u.email }));
}

/** Abre (o reutiliza, si ya existía) el hilo individual con cualquier persona con cuenta en la app — no hace falta compartir equipo. */
export async function createDirectConversation(otherUserId: string): Promise<{ conversationId?: string; error?: string }> {
  const userId = await verifySession();
  if (otherUserId === userId) return { error: "No puedes iniciar una conversación contigo mismo." };
  const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
  if (!other) return { error: "Esa persona no tiene cuenta en MemorIAble." };

  const directKey = [userId, otherUserId].sort().join("_");
  try {
    const conversation = await prisma.chatConversation.upsert({
      where: { directKey },
      update: {},
      create: {
        type: "DIRECT",
        directKey,
        createdById: userId,
        participants: { create: [{ userId }, { userId: otherUserId }] },
      },
      select: { id: true },
    });
    revalidatePath("/chat");
    return { conversationId: conversation.id };
  } catch (err) {
    console.error("No se pudo crear la conversación individual:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido crear la conversación." };
  }
}

/** Crea un grupo personal nuevo con nombre propio y las personas elegidas (además de quien lo crea) — cualquiera con cuenta en la app, no solo del equipo. */
export async function createGroupConversation(nombre: string, memberIds: string[]): Promise<{ conversationId?: string; error?: string }> {
  const userId = await verifySession();

  const trimmed = nombre.trim();
  if (!trimmed) return { error: "Ponle un nombre al grupo." };
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) return { error: `El nombre no puede tener más de ${MAX_GROUP_NAME_LENGTH} caracteres.` };

  const uniqueMemberIds = [...new Set(memberIds.filter((id) => id !== userId))];
  if (uniqueMemberIds.length === 0) return { error: "Elige al menos otra persona para el grupo." };

  const existingCount = await prisma.user.count({ where: { id: { in: uniqueMemberIds } } });
  if (existingCount !== uniqueMemberIds.length) return { error: "Alguna de las personas elegidas ya no tiene cuenta." };

  try {
    const conversation = await prisma.chatConversation.create({
      data: {
        type: "GROUP",
        nombre: trimmed,
        createdById: userId,
        participants: { create: [userId, ...uniqueMemberIds].map((id) => ({ userId: id })) },
      },
      select: { id: true },
    });
    revalidatePath("/chat");
    return { conversationId: conversation.id };
  } catch (err) {
    console.error("No se pudo crear el grupo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido crear el grupo." };
  }
}

/** Añade más gente a un grupo ya existente — cualquiera con cuenta en la app, no solo del equipo (sin roles de admin dentro del chat: cualquier participante puede añadir, mismo espíritu informal de siempre). */
export async function addParticipants(conversationId: string, memberIds: string[]): Promise<{ error?: string }> {
  const userId = await verifySession();
  const conversation = await requireParticipant(conversationId, userId);
  if (!conversation) return { error: "No perteneces a esta conversación." };
  if (conversation.type !== "GROUP") return { error: "Solo se puede añadir gente a un grupo." };

  const uniqueMemberIds = [...new Set(memberIds)];
  const existingCount = await prisma.user.count({ where: { id: { in: uniqueMemberIds } } });
  if (existingCount !== uniqueMemberIds.length) return { error: "Alguna de las personas elegidas ya no tiene cuenta." };

  try {
    await prisma.chatConversationParticipant.createMany({
      data: uniqueMemberIds.map((id) => ({ conversationId, userId: id })),
      skipDuplicates: true,
    });
    revalidatePath("/chat");
    return {};
  } catch (err) {
    console.error("No se pudo añadir a los participantes:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido añadir." };
  }
}

/** Sale de un grupo (no aplica a conversaciones individuales). */
export async function leaveConversation(conversationId: string): Promise<{ error?: string }> {
  const userId = await verifySession();
  const conversation = await requireParticipant(conversationId, userId);
  if (!conversation) return { error: "No perteneces a esta conversación." };
  if (conversation.type !== "GROUP") return { error: "No puedes salir de una conversación individual." };

  try {
    await prisma.chatConversationParticipant.delete({ where: { conversationId_userId: { conversationId, userId } } });
    revalidatePath("/chat");
    return {};
  } catch (err) {
    console.error("No se pudo salir del grupo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido salir del grupo." };
  }
}

/**
 * Últimos mensajes de una conversación, o los posteriores a un cursor
 * (`after`, id de un mensaje ya visto) para el sondeo/refresco incremental.
 * Vacío si el usuario no es participante (nunca lanza — mismo criterio que
 * el resto de lecturas ante un id ajeno/inexistente).
 */
export async function listChatMessages(conversationId: string, after?: string): Promise<ChatMessageView[]> {
  const userId = await verifySession();
  const conversation = await requireParticipant(conversationId, userId);
  if (!conversation) return [];

  const cursor = after ? await prisma.chatMessage.findUnique({ where: { id: after }, select: { createdAt: true } }) : null;

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId, ...(cursor ? { createdAt: { gt: cursor.createdAt } } : {}) },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: cursor ? "asc" : "desc" },
    ...(cursor ? {} : { take: CHAT_MESSAGES_LIMIT }),
  });

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
 * resueltos por la propia petición. Un único sitio para no duplicar el
 * guardado + aviso. Quien llama es responsable de comprobar que `userId`
 * puede escribir en `conversationId` (ver `requireParticipant`).
 * `workspaceId` es null en una conversación personal (denormalizado desde
 * `conversation.workspaceId`, ver el schema).
 */
export async function postChatMessage(
  conversationId: string,
  workspaceId: string | null,
  userId: string,
  texto: string,
  imagenUrl?: string | null,
): Promise<SendChatMessageResult> {
  const trimmed = texto.trim();
  if (!trimmed && !imagenUrl) return { error: "Escribe algo o adjunta una imagen antes de enviar." };
  if (trimmed.length > CHAT_TEXTO_MAX_LENGTH) return { error: `El mensaje no puede tener más de ${CHAT_TEXTO_MAX_LENGTH} caracteres.` };

  try {
    const created = await prisma.chatMessage.create({
      data: { texto: trimmed, imagenUrl: imagenUrl || null, userId, workspaceId, conversationId },
      include: { user: { select: { email: true } } },
    });
    await broadcastNewChatMessage(conversationId);
    // Push a los demás participantes no silenciados. `void` a propósito:
    // el mensaje ya está guardado y el aviso no debe retrasar la respuesta
    // al que escribe (ni tumbarla si falla — ver chatNotifications.ts).
    void notifyChatParticipants(conversationId, userId, trimmed, Boolean(imagenUrl));
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
 * Cualquier participante puede escribir — el chat es comunicación, no una
 * mutación de contenido de workspace (tareas/notas/eventos), así que no
 * pasa por `canWrite`/rol.
 */
export async function sendChatMessage(conversationId: string, texto: string, imagenUrl?: string | null): Promise<SendChatMessageResult> {
  const userId = await verifySession();
  const conversation = await requireParticipant(conversationId, userId);
  if (!conversation) return { error: "No perteneces a esta conversación." };
  return postChatMessage(conversationId, conversation.workspaceId, userId, texto, imagenUrl);
}

/** Sube la imagen adjunta de un mensaje de chat a Vercel Blob — sin `canWrite`, mismo criterio que `sendChatMessage`. */
export async function uploadChatImage(formData: FormData, conversationId: string): Promise<{ url?: string; error?: string }> {
  const userId = await verifySession();
  const conversation = await requireParticipant(conversationId, userId);
  if (!conversation) return { error: "No perteneces a esta conversación." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se ha recibido ningún fichero." };

  const result = await uploadImageToBlob(`chat/${conversationId}`, file);
  if (result.error) Sentry.captureMessage(`Fallo al subir imagen de chat: ${result.error}`);
  return result;
}

/**
 * Borra un mensaje PROPIO. Solo el autor puede borrar lo suyo — ni
 * siquiera el OWNER del workspace borra mensajes ajenos: el chat es
 * comunicación entre personas, no contenido compartido del workspace
 * (mismo criterio por el que escribir no pasa por `canWrite`).
 *
 * `deleteMany` con userId en el where (no `delete` por id): si el mensaje
 * no es suyo, esto no borra nada en vez de tocar el de otro — la
 * comprobación va en la propia consulta.
 */
export async function deleteChatMessage(messageId: string): Promise<{ error?: string }> {
  const userId = await verifySession();
  try {
    const { count } = await prisma.chatMessage.deleteMany({ where: { id: messageId, userId } });
    if (count === 0) return { error: "Solo puedes borrar tus propios mensajes." };
    revalidatePath("/chat");
    return {};
  } catch (err) {
    console.error("No se pudo borrar el mensaje de chat:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar. Inténtalo de nuevo." };
  }
}

/** Marca una conversación como leída hasta ahora — apaga su indicador de no leído. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const userId = await verifySession();
  await prisma.chatConversationParticipant
    .update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: new Date() } })
    .catch((err) => console.error("No se pudo marcar la conversación como leída (no crítico):", err));
}

/** Silencia/reactiva UNA conversación para el usuario actual — no afecta a poder leer/escribir, solo al indicador de no leído. */
export async function setConversationMuted(conversationId: string, muted: boolean): Promise<{ error?: string }> {
  const userId = await verifySession();
  try {
    await prisma.chatConversationParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { muted } });
    return {};
  } catch (err) {
    console.error("No se pudo cambiar el silencio de la conversación:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar." };
  }
}

/** Para el indicador de no leído del menú (Sidebar/BottomTabs, ver layout.tsx) — hay algo sin leer en CUALQUIER conversación no silenciada del usuario. Best-effort: no bloquea la navegación si falla. */
export async function hasUnreadChat(): Promise<boolean> {
  const userId = await verifySession();
  try {
    const participations = await prisma.chatConversationParticipant.findMany({
      where: { userId, muted: false },
      select: { lastReadAt: true, conversation: { select: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } } },
    });
    return participations.some(({ lastReadAt, conversation }) => {
      const latest = conversation.messages[0];
      return latest != null && (!lastReadAt || latest.createdAt > lastReadAt);
    });
  } catch (err) {
    console.error("No se pudo comprobar si hay mensajes de chat sin leer (no crítico):", err);
    return false;
  }
}
