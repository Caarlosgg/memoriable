import "server-only";
import { prisma } from "./prisma";
import { sendPushToUser } from "./webPush";
import { shortEmailName } from "./format";

/** Recorte del mensaje en el aviso — lo justo para saber si merece abrirlo. */
const PREVIEW_MAX_LENGTH = 120;

/**
 * Avisa por push a los demás participantes de una conversación.
 *
 * Deliberadamente NO crea una `Notification` (la campana de la app): un
 * aviso en la bandeja por CADA mensaje de chat la volvería inservible en
 * una conversación normal — es justo el motivo por el que el chat nació
 * con indicador de "no leído" en vez de notificaciones (ver el comentario
 * del modelo ChatMessage en el schema). El push sí encaja: es efímero,
 * no se acumula, y es lo que cualquiera espera de un mensaje directo.
 *
 * Respeta el silencio POR CONVERSACIÓN (`muted`): silenciar un grupo tiene
 * que dejar de avisar de verdad, no solo apagar el puntito del menú.
 *
 * Best-effort de principio a fin: el mensaje ya está guardado cuando esto
 * se llama, así que ningún fallo de aquí puede tumbar el envío.
 */
export async function notifyChatParticipants(
  conversationId: string,
  senderUserId: string,
  texto: string,
  tieneImagen: boolean,
): Promise<void> {
  try {
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        nombre: true,
        participants: {
          // `status: "ACTIVE"`: quien todavía no ha aceptado la invitación
          // al grupo no debe recibir push de sus mensajes — se enteraría de
          // conversaciones a las que ni ha decidido si entra.
          where: { muted: false, userId: { not: senderUserId }, status: "ACTIVE" },
          select: { userId: true },
        },
      },
    });
    if (!conversation || conversation.participants.length === 0) return;

    const sender = await prisma.user.findUnique({ where: { id: senderUserId }, select: { email: true } });
    const quien = shortEmailName(sender?.email ?? "Alguien");
    // En un grupo hace falta saber DE QUÉ grupo, no solo quién escribe.
    const title = conversation.type === "GROUP" ? `${quien} · ${conversation.nombre ?? "Grupo"}` : quien;
    const body = texto.trim()
      ? texto.trim().slice(0, PREVIEW_MAX_LENGTH)
      : tieneImagen
        ? "📷 Imagen"
        : "";

    await Promise.all(
      conversation.participants.map((p) =>
        // `tag` por conversación: cinco mensajes seguidos del mismo hilo
        // dejan UN aviso que se va actualizando, no cinco apilados.
        sendPushToUser(p.userId, { title, body, link: "/chat", tag: `chat-${conversationId}` }).catch((err) => {
          console.error("No se pudo avisar por push de un mensaje de chat (no crítico):", err);
        }),
      ),
    );
  } catch (err) {
    console.error("No se pudo preparar el aviso de chat (no crítico):", err);
  }
}
