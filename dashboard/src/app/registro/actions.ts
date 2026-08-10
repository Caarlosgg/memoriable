"use server";

import * as Sentry from "@sentry/nextjs";
import { Prisma } from "@prisma/client";
import { hashPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { createVerificationToken } from "@/lib/verification";
import { sendVerificationEmail, resolveBaseUrl } from "@/lib/email";
import { createPersonalWorkspace } from "@/lib/workspace";

export interface RegisterState {
  error?: string;
  /** true cuando la cuenta ya se creó y solo falta confirmar el email. */
  registered?: boolean;
  /** true si el correo de verificación se pudo enviar de verdad — la UI no promete "revisa tu correo" si esto es false. */
  emailSent?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321

// Alta de cuentas: más restrictivo que el login (5 por IP cada 15 minutos).
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

export async function register(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return { error: "Escribe un email válido." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  // bcrypt ignora más de 72 bytes: se rechaza en vez de truncar en silencio.
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { error: `La contraseña no puede tener más de ${MAX_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== passwordConfirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  const limit = await checkRateLimit(`registro:${await clientIp()}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
  if (!limit.allowed) {
    return { error: `Demasiados intentos. Espera ${limit.retryAfterSeconds}s e inténtalo de nuevo.` };
  }

  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    // Cuenta + workspace personal + membership OWNER en una sola
    // transacción — nunca debe existir un User sin su espacio personal
    // (ver createPersonalWorkspace, mismo motivo que en googleOAuth.ts).
    userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash } });
      await createPersonalWorkspace(tx, user.id);
      return user.id;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Email duplicado: alguien intentando registrarse dos veces, no un
      // bug — no tiene sentido mandarlo a Sentry como si lo fuera.
      return { error: "Ya existe una cuenta con ese email." };
    }
    console.error("Error al registrar cuenta:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido crear la cuenta. Inténtalo de nuevo." };
  }

  // La cuenta ya existe en este punto (el create de arriba ya terminó): no
  // se inicia sesión automáticamente — nace sin verificar (emailVerified:
  // false por defecto) y el login la rechaza hasta que confirme el correo.
  // Si el envío falla (p. ej. sin GMAIL_USER/GMAIL_APP_PASSWORD), la cuenta
  // sigue creada igual: desde /login siempre se puede pedir que se reenvíe.
  // `emailSent` viaja a la UI para que no diga "revisa tu correo" cuando en
  // realidad no se ha mandado nada.
  let emailSent = false;
  try {
    const token = await createVerificationToken(userId);
    const baseUrl = await resolveBaseUrl();
    emailSent = await sendVerificationEmail(email, `${baseUrl}/verificar-email?token=${token}`);
  } catch (err) {
    console.error("Cuenta creada pero falló el envío del correo de verificación:", err);
    Sentry.captureException(err);
  }

  return { registered: true, emailSent };
}
