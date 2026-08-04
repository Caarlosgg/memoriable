import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * Máximo de la contraseña. bcrypt IGNORA todo lo que pase de 72 bytes: sin
 * este tope, dos contraseñas que comparten los primeros 72 bytes hashean
 * igual (y "verificarían" la una a la otra). Se rechaza explícitamente en
 * vez de truncar en silencio.
 */
export const MAX_PASSWORD_LENGTH = 72;

/** Mínimo razonable para no aceptar contraseñas triviales sin ser puntilloso. */
export const MIN_PASSWORD_LENGTH = 8;

/** Hashea una contraseña para guardarla en `User.passwordHash`. Nunca se guarda en claro. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compara una contraseña candidata contra el hash guardado. */
export function verifyPassword(candidate: string, hash: string): Promise<boolean> {
  return bcrypt.compare(candidate, hash);
}

/**
 * Hash de relleno (contraseña aleatoria, mismo coste que el real) contra el
 * que comparar cuando el email no existe. Así el login tarda lo mismo tanto
 * si la cuenta existe como si no — sin esto, "no existe" respondería mucho
 * más rápido (no corre bcrypt) y eso permitiría enumerar cuentas por tiempo.
 */
const DUMMY_PASSWORD_HASH = "$2b$12$.YigSt29rPCk5bl8H48NuuS8Z.4KK07qO2L0B4InvPBgQCXJfzkuS";

/**
 * Verifica la contraseña contra el hash de un usuario que puede no existir
 * (`null`). Siempre ejecuta una comparación bcrypt real (contra un hash de
 * relleno si no hay usuario), de modo que el tiempo de respuesta no delata
 * si la cuenta existe. Devuelve `false` si no hay usuario, pase lo que pase.
 */
export async function verifyPasswordConstantTime(
  candidate: string,
  hash: string | null,
): Promise<boolean> {
  const matches = await bcrypt.compare(candidate, hash ?? DUMMY_PASSWORD_HASH);
  return hash !== null && matches;
}

const LINK_CODE_ALPHABET = "0123456789";
const LINK_CODE_LENGTH = 6;
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Código corto de un solo uso para vincular el chat de Telegram desde el
 * dashboard. Usa `crypto.randomInt` (CSPRNG), no `Math.random` — el código
 * vincula una cuenta a un chat de Telegram, así que debe ser impredecible.
 */
export function generateLinkCode(): { code: string; expiresAt: Date } {
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return { code, expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS) };
}
