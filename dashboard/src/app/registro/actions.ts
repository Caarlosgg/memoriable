"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export interface RegisterState {
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) {
    return { error: "Escribe un email válido." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
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
