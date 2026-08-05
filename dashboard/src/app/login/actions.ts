"use server";

import { redirect } from "next/navigation";
import { verifyPasswordConstantTime, needsRehash, hashPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export interface LoginState {
  error?: string;
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
    // en ambos casos: tampoco se revela cuál de los dos falló.
    const ok = await verifyPasswordConstantTime(password, user?.passwordHash ?? null);
    if (!user || !ok) {
      return { error: "Email o contraseña incorrectos." };
    }
    userId = user.id;

    // Migración transparente de bcrypt a argon2id: si el hash guardado es el
    // formato viejo, se regenera ahora que ya se sabe que la contraseña es
    // correcta. No crítico: si falla, el login sigue adelante igual y se
    // reintenta en el próximo login.
    if (needsRehash(user.passwordHash)) {
      try {
        const newHash = await hashPassword(password);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      } catch (err) {
        console.error("No se pudo regenerar el hash de la contraseña (no crítico):", err);
      }
    }
  } catch (err) {
    console.error("Error al comprobar las credenciales:", err);
    return { error: "No se ha podido comprobar tu cuenta. Inténtalo de nuevo en un momento." };
  }

  try {
    await createSession(userId);
  } catch (err) {
    console.error("Credenciales correctas pero no se pudo iniciar sesión:", err);
    return { error: "Tu cuenta es correcta, pero no se ha podido iniciar sesión. Inténtalo de nuevo en un momento." };
  }

  redirect("/");
}
