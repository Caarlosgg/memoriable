import "server-only";
import webPush from "web-push";
import { prisma } from "./prisma";

/**
 * Lazy, igual que el resto de integraciones externas (ver lib/pipeline.ts):
 * sin `VAPID_PRIVATE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, el push
 * simplemente no se activa — el resto de la app (incluida la propia
 * bandeja de notificaciones dentro de la app) sigue funcionando igual.
 */
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails("mailto:soporte@memoriable.app", publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  /**
   * Agrupa avisos: dos push con el mismo `tag` no se apilan, el segundo
   * sustituye al primero. Para el chat es lo que evita que cinco mensajes
   * seguidos de la misma conversación dejen cinco avisos en la bandeja del
   * sistema (ver chatNotifications.ts). Sin `tag`, cada aviso es
   * independiente — el comportamiento de siempre para asignaciones.
   */
  tag?: string;
}

/**
 * Manda un push a TODAS las suscripciones del usuario (varios
 * dispositivos) — best-effort, nunca debe tirar la notificación en la
 * propia app si esto falla (ver createNotification en notifications.ts,
 * que es quien lo llama). Una suscripción caducada (404/410 — el
 * navegador ya no la reconoce) se borra sola en vez de seguir
 * intentándolo cada vez.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("No se pudo enviar el push (no crítico):", err);
        }
      }
    }),
  );
}
