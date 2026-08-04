"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { hashPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export interface RegisterState {
  error?: string;
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

  const limit = checkRateLimit(`registro:${await clientIp()}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
  if (!limit.allowed) {
    return { error: `Demasiados intentos. Espera ${limit.retryAfterSeconds}s e inténtalo de nuevo.` };
  }

  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, passwordHash } });
    userId = user.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Ya existe una cuenta con ese email." };
    }
    console.error("Error al registrar cuenta:", err);
    return { error: "No se ha podido crear la cuenta. Inténtalo de nuevo." };
  }

  // La cuenta ya existe en este punto (el create de arriba ya terminó) — si
  // falla justo la sesión (p. ej. un problema puntual leyendo SESSION_SECRET),
  // no tiene sentido decir "no se ha podido crear la cuenta": eso confundiría
  // a alguien que reintente y se encuentre con "ya existe una cuenta". Se
  // manda a /login con la cuenta ya lista en vez de fingir que no pasó nada.
  try {
    await createSession(userId);
  } catch (err) {
    console.error("Cuenta creada pero no se pudo iniciar sesión automáticamente:", err);
    redirect("/login");
  }

  redirect("/");
}
