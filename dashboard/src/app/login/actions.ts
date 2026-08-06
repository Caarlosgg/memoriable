"use server";

import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { verifyPasswordConstantTime, needsRehash, hashPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { createVerificationToken } from "@/lib/verification";
import { sendVerificationEmail, resolveBaseUrl } from "@/lib/email";

export interface LoginState {
  error?: string;
  /** true cuando el único problema es que falta confirmar el email (ofrece reenviar). */
  sinVerificar?: boolean;
}

// Freno de fuerza bruta: 10 intentos por IP cada 5 minutos (best-effort en
// serverless, ver rateLimit.ts).
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Escribe tu email y contraseña." };
  }

  const limit = await checkRateLimit(`login:${await clientIp()}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.allowed) {
    return { error: `Demasiados intentos. Espera ${limit.retryAfterSeconds}s e inténtalo de nuevo.` };
  }

  let userId: string;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    // Comparación en tiempo constante: corre bcrypt exista o no la cuenta,
    // para no delatar por tiempo si el email está registrado. Mismo mensaje
    // en ambos casos: tampoco se revela cuál de los dos falló. Si la cuenta
    // es solo-OAuth (passwordHash null), esto también falla limpiamente —
    // no hay ninguna contraseña real que pueda coincidir.
    const ok = await verifyPasswordConstantTime(password, user?.passwordHash ?? null);
    if (!user || !ok) {
      return { error: "Email o contraseña incorrectos." };
    }
    // Cuentas creadas por email/contraseña exigen confirmar el correo antes
    // de poder entrar (las de Google nacen ya verificadas, ver
    // api/auth/google/callback/route.ts, así que nunca caen aquí).
    if (!user.emailVerified) {
      return { error: "Todavía no has confirmado tu email.", sinVerificar: true };
    }
    userId = user.id;

    // Migración transparente de bcrypt a argon2id: si el hash guardado es el
    // formato viejo, se regenera ahora que ya se sabe que la contraseña es
    // correcta. No crítico: si falla, el login sigue adelante igual y se
    // reintenta en el próximo login.
    if (needsRehash(user.passwordHash!)) {
      try {
        const newHash = await hashPassword(password);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      } catch (err) {
        console.error("No se pudo regenerar el hash de la contraseña (no crítico):", err);
      }
    }
  } catch (err) {
    console.error("Error al comprobar las credenciales:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido comprobar tu cuenta. Inténtalo de nuevo en un momento." };
  }

  try {
    await createSession(userId);
  } catch (err) {
    console.error("Credenciales correctas pero no se pudo iniciar sesión:", err);
    Sentry.captureException(err);
    return { error: "Tu cuenta es correcta, pero no se ha podido iniciar sesión. Inténtalo de nuevo en un momento." };
  }

  redirect("/");
}

export interface ResendVerificationState {
  sent?: boolean;
  error?: string;
}

// Mismo criterio que login/registro: freno por IP, más permisivo que
// registro (alguien puede pulsar "reenviar" un par de veces sin querer).
const RESEND_LIMIT = 3;
const RESEND_WINDOW_MS = 15 * 60 * 1000;

/**
 * Reenvía el correo de verificación. Nunca revela si el email existe o no
 * (mismo motivo que el login: no convertir esto en una forma de enumerar
 * cuentas) — siempre responde "sent: true", exista la cuenta o no.
 */
export async function resendVerification(
  _prevState: ResendVerificationState,
  formData: FormData,
): Promise<ResendVerificationState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Escribe tu email." };

  const limit = await checkRateLimit(`reenviar-verificacion:${await clientIp()}`, RESEND_LIMIT, RESEND_WINDOW_MS);
  if (!limit.allowed) {
    return { error: `Demasiados intentos. Espera ${limit.retryAfterSeconds}s e inténtalo de nuevo.` };
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified) {
      const token = await createVerificationToken(user.id);
      const baseUrl = await resolveBaseUrl();
      await sendVerificationEmail(email, `${baseUrl}/verificar-email?token=${token}`);
    }
  } catch (err) {
    console.error("Fallo al reenviar el correo de verificación:", err);
    Sentry.captureException(err);
  }

  return { sent: true };
}
