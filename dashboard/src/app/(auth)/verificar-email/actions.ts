"use server";

import { redirect } from "next/navigation";
import { verifyEmailToken, type VerifyEmailStatus } from "@/lib/verification";
import { createSession } from "@/lib/session";

export interface ConfirmarEmailState {
  /** Ausente hasta que el formulario se envía por primera vez. */
  status?: VerifyEmailStatus;
}

/**
 * Confirma la cuenta y entra directamente.
 *
 * Va en un Server Action y no en el render de la página por dos motivos que
 * apuntan al mismo sitio:
 *
 * 1. No se puede escribir la cookie de sesión durante el renderizado de un
 *    Server Component (ver `createSession`), y sin cookie no hay auto-login:
 *    el usuario acababa en /login re-tecleando email y contraseña que ya
 *    había escrito cinco minutos antes. Era el escalón más caro del embudo.
 * 2. El token es de un solo uso. Consumirlo en un GET significa que
 *    cualquier antivirus o escáner de correo corporativo que "visita" los
 *    enlaces del mensaje se lo gasta ANTES que el usuario, que llega a un
 *    "enlace no válido" sin haber hecho nada mal. En POST eso no pasa.
 *
 * El token acredita quién eres tanto como la contraseña (llegó al buzón que
 * se está verificando), así que iniciar sesión con él no rebaja la
 * seguridad; y la sesión se crea larga a propósito: quien acaba de darse de
 * alta no quiere volver a entrar mañana.
 */
export async function confirmarEmail(
  _prevState: ConfirmarEmailState,
  formData: FormData,
): Promise<ConfirmarEmailState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { status: "invalido" };

  const { status, userId } = await verifyEmailToken(token);
  if (status !== "ok" || !userId) return { status };

  await createSession(userId);
  // Directo a /inicio y no a "/": la raíz es una redirección, y encadenar
  // dos saltos justo después de crear la cookie no aporta nada. Allí le
  // espera la tarjeta de primeros pasos.
  redirect("/inicio");
}
