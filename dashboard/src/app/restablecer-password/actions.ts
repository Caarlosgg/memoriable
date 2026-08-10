"use server";

import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { hashPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { resetPasswordWithToken } from "@/lib/passwordReset";

export interface ResetPasswordState {
  error?: string;
  /** El propio token ya no vale (caducado o ya usado) — la UI ofrece pedir uno nuevo. */
  tokenInvalido?: boolean;
}

// Mismo orden de magnitud que login: quien tiene el token ya demostró
// control del email, esto solo frena fuerza bruta sobre el formulario.
const RESET_LIMIT = 10;
const RESET_WINDOW_MS = 5 * 60 * 1000;

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!token) return { error: "Enlace no válido.", tokenInvalido: true };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { error: `La contraseña no puede tener más de ${MAX_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== passwordConfirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  const limit = await checkRateLimit(`restablecer-password:${await clientIp()}`, RESET_LIMIT, RESET_WINDOW_MS);
  if (!limit.allowed) {
    return { error: `Demasiados intentos. Espera ${limit.retryAfterSeconds}s e inténtalo de nuevo.` };
  }

  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    const result = await resetPasswordWithToken(token, passwordHash);
    if (result.status !== "ok") {
      return {
        error:
          result.status === "caducado"
            ? "Este enlace ha caducado. Pide uno nuevo desde la pantalla de entrar."
            : "Este enlace no es válido o ya se ha usado. Pide uno nuevo desde la pantalla de entrar.",
        tokenInvalido: true,
      };
    }
    userId = result.userId;
  } catch (err) {
    console.error("Error al restablecer la contraseña:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido cambiar la contraseña. Inténtalo de nuevo." };
  }

  // Ya ha demostrado control del email (el enlace) Y ha elegido contraseña
  // nueva — se le entra directamente, sin pedirle que además haga login a
  // mano con la contraseña que acaba de escribir.
  try {
    await createSession(userId);
  } catch (err) {
    console.error("Contraseña cambiada pero no se pudo iniciar sesión:", err);
    Sentry.captureException(err);
    redirect("/login");
  }

  redirect("/");
}
