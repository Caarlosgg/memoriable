"use server";

import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export interface LoginState {
  error?: string;
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Escribe tu email y contraseña." };
  }

  let userId: string;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    // Mismo mensaje tanto si el email no existe como si la contraseña no
    // coincide: no revelar cuál de los dos falló.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return { error: "Email o contraseña incorrectos." };
    }
    userId = user.id;
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
