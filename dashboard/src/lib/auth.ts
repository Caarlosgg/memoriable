import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Hashea una contraseña para guardarla en `User.passwordHash`. Nunca se guarda en claro. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compara una contraseña candidata contra el hash guardado. */
export function verifyPassword(candidate: string, hash: string): Promise<boolean> {
  return bcrypt.compare(candidate, hash);
}

/** Mínimo razonable para no aceptar contraseñas triviales sin ser puntilloso. */
export const MIN_PASSWORD_LENGTH = 8;

const LINK_CODE_ALPHABET = "0123456789";
const LINK_CODE_LENGTH = 6;
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** Código corto de un solo uso para vincular el chat de Telegram desde el dashboard. */
export function generateLinkCode(): { code: string; expiresAt: Date } {
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    code += LINK_CODE_ALPHABET[Math.floor(Math.random() * LINK_CODE_ALPHABET.length)];
  }
  return { code, expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS) };
}
