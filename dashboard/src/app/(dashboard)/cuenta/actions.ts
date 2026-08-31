"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { verifySession } from "@/lib/dal";
import { generateLinkCode, hashPassword, verifyPassword } from "@/lib/auth";
import { validarPassword } from "@/lib/passwordPolicy";
import { createSession } from "@/lib/session";
import { revokeAllSessions } from "@/lib/sessionRevocation";
import { prisma } from "@/lib/prisma";
import { buildExportData, toExportJson, toExportMarkdown, isExportScope, type ExportScope } from "@/lib/exportData";
import type { NotificationType } from "@prisma/client";

export interface GenerateLinkCodeState {
  code?: string;
  expiresAt?: string;
  error?: string;
}

/**
 * Genera un código corto de un solo uso para vincular el chat de Telegram a
 * la cuenta actual. El propio bot lo consume con /vincular <código> (ver
 * src/telegram/bot.ts) y fija `telegramChatId` en esta misma fila.
 */
export async function generateTelegramLinkCode(): Promise<GenerateLinkCodeState> {
  const userId = await verifySession();

  const { code, expiresAt } = generateLinkCode();
  try {
    await prisma.user.update({ where: { id: userId }, data: { linkCode: code, linkCodeExpiresAt: expiresAt } });
  } catch (err) {
    console.error("No se pudo generar el código de vínculo:", err);
    return { error: "No se ha podido generar el código. Inténtalo de nuevo." };
  }

  revalidatePath("/cuenta");
  return { code, expiresAt: expiresAt.toISOString() };
}

export interface ChangePasswordResult {
  error?: string;
  ok?: boolean;
}

/**
 * Cambia (o añade) la contraseña de la cuenta ya autenticada — distinto del
 * flujo de "olvidé mi contraseña" (que exige un token por email porque no
 * hay sesión). Si la cuenta ya tiene contraseña, exige la actual para
 * cambiarla (evita que alguien con la sesión abierta en un dispositivo
 * ajeno se la cambie sin más); si no la tiene (cuenta solo de Google), no
 * hay nada que verificar — se limita a añadirle una, lo que de paso le
 * habilita el login por email/contraseña además del de Google.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newPasswordConfirm: string,
): Promise<ChangePasswordResult> {
  const userId = await verifySession();

  const passwordError = validarPassword(newPassword);
  if (passwordError) return { error: passwordError };
  if (newPassword !== newPasswordConfirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });

    if (user.passwordHash) {
      const matches = await verifyPassword(currentPassword, user.passwordHash);
      if (!matches) return { error: "La contraseña actual no es correcta." };
    }

    const passwordHash = await hashPassword(newPassword);
    // Cambiar la contraseña echa de TODAS las sesiones abiertas: es
    // justo lo que espera quien la cambia porque cree que alguien más ha
    // entrado (ver sessionRevocation.ts). `sessionsValidFrom` y el hash
    // se escriben juntos — no tendría sentido que uno se aplicara y el
    // otro no.
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionsValidFrom: new Date() },
    });
    // ...menos de la de este dispositivo: quien acaba de demostrar que
    // sabe la contraseña actual no tiene por qué volver a entrar. Se le
    // emite una sesión nueva (posterior a la marca, así que válida).
    await createSession(userId);
    return { ok: true };
  } catch (err) {
    console.error("Error al cambiar la contraseña:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido cambiar la contraseña. Inténtalo de nuevo." };
  }
}

/**
 * "Cerrar sesión en el resto de dispositivos", sin cambiar la contraseña —
 * para quien se dejó la sesión abierta en un ordenador ajeno. Misma
 * mecánica que el cambio de contraseña: se revoca todo y se emite una
 * sesión nueva para el dispositivo actual.
 */
export async function closeOtherSessions(): Promise<{ error?: string; ok?: boolean }> {
  const userId = await verifySession();
  try {
    await revokeAllSessions(userId);
    await createSession(userId);
    return { ok: true };
  } catch (err) {
    console.error("No se pudieron cerrar las demás sesiones:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido completar. Inténtalo de nuevo." };
  }
}

export interface ExportResult {
  content?: string;
  filename?: string;
  error?: string;
}

/**
 * Exportación completa de datos del usuario (casi obligatoria de cara a
 * RGPD): todo / solo notas / una categoría, en Markdown o JSON. Devuelve
 * el contenido como texto — el cliente lo convierte en descarga con un
 * Blob, no hay ningún fichero temporal en el servidor.
 */
export async function exportData(scope: ExportScope, format: "markdown" | "json"): Promise<ExportResult> {
  const userId = await verifySession();
  if (!isExportScope(scope)) return { error: "Alcance de exportación no válido." };

  try {
    const payload = await buildExportData(userId, scope);
    const content = format === "json" ? toExportJson(payload) : toExportMarkdown(payload);
    const scopeSlug = scope.type === "categoria" ? scope.categoria : scope.type;
    const dateSlug = payload.generatedAt.slice(0, 10);
    const extension = format === "json" ? "json" : "md";
    return { content, filename: `memoriable-${scopeSlug}-${dateSlug}.${extension}` };
  } catch (err) {
    console.error("Error al exportar los datos:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido generar la exportación. Inténtalo de nuevo." };
  }
}

export type NotificationPrefs = Partial<Record<NotificationType, boolean>>;

/** Activa/desactiva un tipo de notificación — ver `createNotification` en lib/notifications.ts, que es quien de verdad respeta esto. */
export async function setNotificationPref(type: NotificationType, enabled: boolean): Promise<{ error?: string }> {
  const userId = await verifySession();
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    const prefs = { ...(user?.notificationPrefs as NotificationPrefs | undefined) };
    if (enabled) delete prefs[type];
    else prefs[type] = false;
    await prisma.user.update({ where: { id: userId }, data: { notificationPrefs: prefs } });
    revalidatePath("/cuenta");
    return {};
  } catch (err) {
    console.error("No se pudo guardar la preferencia de notificación:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Guarda una suscripción push del navegador — se llama tras aceptar el permiso de notificaciones (ver PushNotificationsToggle.tsx). `endpoint` es único: si ya existía (mismo navegador, re-suscrito), la actualiza en vez de duplicarla. */
export async function savePushSubscription(subscription: PushSubscriptionInput): Promise<{ error?: string }> {
  const userId = await verifySession();
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
    return {};
  } catch (err) {
    console.error("No se pudo guardar la suscripción push:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido activar. Inténtalo de nuevo." };
  }
}

/** Borra una suscripción push (al desactivar el toggle, o si el navegador la invalida). */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } }).catch((err) => {
    console.error("No se pudo borrar la suscripción push (no crítico):", err);
  });
}

/** Si ESTE usuario ya tiene alguna suscripción push guardada — para pintar el toggle ya activado al cargar /cuenta (no dice si ESTE navegador está suscrito, ver PushNotificationsToggle.tsx). */
export async function hasPushSubscription(): Promise<boolean> {
  const userId = await verifySession();
  const count = await prisma.pushSubscription.count({ where: { userId } });
  return count > 0;
}

/** Cierra para siempre la tarjeta de "primeros pasos" de /asistente — ver components/OnboardingChecklist.tsx. */
export async function dismissOnboarding(): Promise<void> {
  const userId = await verifySession();
  await prisma.user.update({ where: { id: userId }, data: { onboardingDismissed: true } }).catch((err) => {
    console.error("No se pudo cerrar «primeros pasos»:", err);
  });
  revalidatePath("/asistente");
}
