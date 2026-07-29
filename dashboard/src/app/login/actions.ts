"use server";

import { redirect } from "next/navigation";
import { passwordMatches } from "@/lib/auth";
import { requireDashboardPassword } from "@/lib/env";
import { createSession } from "@/lib/session";

export interface LoginState {
  error?: string;
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!password) {
    return { error: "Escribe la contraseña." };
  }
  if (!passwordMatches(password, requireDashboardPassword())) {
    return { error: "Contraseña incorrecta." };
  }

  await createSession();
  redirect("/");
}
