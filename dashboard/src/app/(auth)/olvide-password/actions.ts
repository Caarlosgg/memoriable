"use server";

import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { createPasswordResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail, resolveBaseUrl } from "@/lib/email";

export interface RequestPasswordResetState {
  sent?: boolean;
  error?: string;
}

// Mismo criterio que resendVerification: freno por IP, no muy estricto (es
// fácil pedirlo dos veces sin querer), pero suficiente para frenar abuso.
const RESET_REQUEST_LIMIT = 3;
const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;

/**
 * Pide el enlace de restablecer contraseña. Nunca revela si el email existe
 * o no (mismo motivo que login/resendVerification: no convertir esto en una
 * forma de enumerar cuentas) — siempre responde `sent: true`.
 */
export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Escribe tu email." };

  const limit = await checkRateLimit(`olvide-password:${await clientIp()}`, RESET_REQUEST_LIMIT, RESET_REQUEST_WINDOW_MS);
  if (!limit.allowed) {
    return { error: `Demasiados intentos. Espera ${limit.retryAfterSeconds}s e inténtalo de nuevo.` };
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    // Una cuenta creada solo por Google no tiene passwordHash propio — no
    // tiene sentido mandarle un enlace para "cambiar" una contraseña que
    // nunca ha existido (tendría que entrar con Google, no con contraseña).
    if (user && user.passwordHash) {
      const token = await createPasswordResetToken(user.id);
      const baseUrl = await resolveBaseUrl();
      await sendPasswordResetEmail(email, `${baseUrl}/restablecer-password?token=${token}`);
    }
  } catch (err) {
    console.error("Fallo al pedir el restablecimiento de contraseña:", err);
    Sentry.captureException(err);
  }

  return { sent: true };
}
