import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Token de un solo uso, largo y aleatorio (256 bits) — no adivinable por fuerza bruta. */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** Crea (o renueva) el token de verificación de email de un usuario. */
export async function createVerificationToken(userId: string): Promise<string> {
  const token = generateToken();
  // Los tokens viejos sin usar de este usuario ya no sirven de nada una vez
  // se pide uno nuevo (p. ej. al pulsar "reenviar correo") — se limpian para
  // no dejar basura acumulándose en la tabla.
  await prisma.verificationToken.deleteMany({ where: { userId } });
  await prisma.verificationToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  return token;
}

export type VerifyEmailStatus = "ok" | "invalido" | "caducado";

/**
 * `userId` solo viene cuando el estado es "ok" — es lo que permite iniciar
 * sesión directamente tras confirmar, sin volver a pedir credenciales a
 * alguien cuya identidad el propio token acaba de demostrar.
 */
export interface VerifyEmailResult {
  status: VerifyEmailStatus;
  userId?: string;
}

/**
 * Consume un token de verificación: si es válido y no ha caducado, marca la
 * cuenta como verificada y borra el token (un solo uso). Idempotente frente
 * a doble clic: si la cuenta ya estaba verificada, también devuelve "ok".
 */
export async function verifyEmailToken(token: string): Promise<VerifyEmailResult> {
  const found = await prisma.verificationToken.findUnique({ where: { token } });
  if (!found) return { status: "invalido" };

  if (found.expiresAt < new Date()) {
    await prisma.verificationToken.delete({ where: { id: found.id } }).catch(() => {});
    return { status: "caducado" };
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: found.userId }, data: { emailVerified: true } }),
    prisma.verificationToken.delete({ where: { id: found.id } }),
  ]);
  return { status: "ok", userId: found.userId };
}
