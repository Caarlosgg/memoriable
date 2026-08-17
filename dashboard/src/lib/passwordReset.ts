import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";

/** Más corto que el de verificación de email (24h): una vez pedido, se
 * espera que se use enseguida — cuanto menos viva un token que da control
 * total de la cuenta, mejor. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Token de un solo uso, largo y aleatorio (256 bits) — no adivinable por fuerza bruta. */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** Crea (o renueva) el token de restablecimiento de contraseña de un usuario. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = generateToken();
  // Los tokens viejos sin usar de este usuario ya no sirven de nada una vez
  // se pide uno nuevo — se limpian para no dejar basura acumulándose ni
  // dejar vivo un enlace anterior que ya no debería funcionar.
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  return token;
}

export type PasswordResetTokenStatus = "ok" | "invalido" | "caducado";

/** Comprueba un token sin consumirlo — usado por la página del enlace para
 * decidir si mostrar el formulario de nueva contraseña. */
export async function checkPasswordResetToken(token: string): Promise<PasswordResetTokenStatus> {
  const found = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!found) return "invalido";
  if (found.expiresAt < new Date()) return "caducado";
  return "ok";
}

export type ResetPasswordResult =
  | { status: "ok"; userId: string }
  | { status: "invalido" | "caducado" };

/**
 * Consume un token de restablecimiento: si es válido y no ha caducado,
 * guarda el nuevo hash de contraseña y borra el token (un solo uso) — misma
 * transacción, mismo criterio que `verifyEmailToken`, para que dos envíos
 * simultáneos del mismo enlace no puedan los dos "ganar". Devuelve el
 * userId en caso de éxito para que quien llama pueda iniciar sesión
 * directamente (ya ha demostrado control del email Y ha elegido contraseña
 * nueva, no hace falta pedirle que entre otra vez a mano).
 */
export async function resetPasswordWithToken(
  token: string,
  passwordHash: string,
): Promise<ResetPasswordResult> {
  const found = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!found) return { status: "invalido" };
  if (found.expiresAt < new Date()) {
    await prisma.passwordResetToken.delete({ where: { id: found.id } }).catch(() => {});
    return { status: "caducado" };
  }

  try {
    await prisma.$transaction([
      // `accountPending: false` no molesta a una cuenta normal (ya lo era);
      // para una cuenta corporativa (ver equipo/actions.ts) esto ES la
      // activación — elegir contraseña y quedar activo son el mismo paso.
      //
      // `sessionsValidFrom`: restablecer la contraseña por email es la
      // señal más fuerte de "creo que alguien ha entrado en mi cuenta" —
      // se cierran todas las sesiones abiertas (ver sessionRevocation.ts).
      // Quien lo hace recibe una sesión nueva justo después
      // (restablecer-password/actions.ts), así que no se echa a sí mismo.
      prisma.user.update({
        where: { id: found.userId },
        data: { passwordHash, accountPending: false, sessionsValidFrom: new Date() },
      }),
      prisma.passwordResetToken.delete({ where: { id: found.id } }),
    ]);
  } catch {
    // El token ya se consumió entretanto (doble envío simultáneo del mismo
    // enlace): la segunda petición no debe fingir éxito.
    return { status: "invalido" };
  }
  return { status: "ok", userId: found.userId };
}
