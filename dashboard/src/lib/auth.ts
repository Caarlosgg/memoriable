import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import * as argon2 from "@node-rs/argon2";

/**
 * Reexportadas desde `passwordPolicy.ts`, que es donde viven ahora junto
 * al resto de la política (y SIN "server-only", para que el formulario
 * pueda evaluar los mismos requisitos en vivo). Se mantienen aquí para no
 * romper a quien ya las importaba de este módulo.
 */
export { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "./passwordPolicy";

/** Detecta si un hash ya está en formato argon2 (vs. bcrypt heredado). */
function isArgon2Hash(hash: string): boolean {
  return hash.startsWith("$argon2");
}

/**
 * Hashea una contraseña para guardarla en `User.passwordHash`. Nunca se
 * guarda en claro. Usa argon2id (parámetros por defecto de `@node-rs/argon2`
 * ya son los recomendados por OWASP: m=19456 KiB, t=2, p=1) — sustituye a
 * bcrypt, que sigue soportado solo para verificar hashes ya existentes
 * (ver `verifyPassword`/`needsRehash`).
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/** Compara una contraseña candidata contra el hash guardado, sea argon2id o bcrypt heredado. */
export function verifyPassword(candidate: string, hash: string): Promise<boolean> {
  return isArgon2Hash(hash) ? argon2.verify(hash, candidate) : bcrypt.compare(candidate, hash);
}

/**
 * Un hash bcrypt heredado (de antes de la migración a argon2id) debe
 * regenerarse la próxima vez que su dueño inicie sesión con éxito.
 */
export function needsRehash(hash: string): boolean {
  return !isArgon2Hash(hash);
}

/**
 * Hash de relleno (contraseña aleatoria fija, mismo coste que un hash real)
 * contra el que comparar cuando el email no existe. Así el login tarda lo
 * mismo tanto si la cuenta existe (y ya está en argon2id) como si no — sin
 * esto, "no existe" respondería mucho más rápido y eso permitiría enumerar
 * cuentas por tiempo. No es el hash de ninguna contraseña real: se generó
 * una vez a partir de una cadena aleatoria descartada.
 *
 * Nota (transitorio, mientras dure la migración de bcrypt a argon2id): una
 * cuenta real que TODAVÍA no se ha reautenticado desde este cambio sigue
 * verificando con bcrypt, que es más rápido que argon2id. Eso crea una
 * diferencia de tiempo observable entre "cuenta ya migrada o inexistente"
 * y "cuenta real aún sin migrar" — una fuga mucho más limitada que la
 * original (no distingue existe/no existe, solo "recién migrada o no") y
 * que desaparece sola en cuanto esa cuenta vuelve a iniciar sesión
 * (`needsRehash`). Igualar del todo el coste exigiría correr ambos
 * algoritmos en cada intento, duplicando el coste de CPU de cada login;
 * no compensa para esta fuga residual y acotada en el tiempo.
 */
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$52BuDa7mMT98vuj8BjW1eg$WZ67o2i/nxwfkYgRe0ju9ryNi3cEpGp0YRdbAH1Ctrk";

/**
 * Verifica la contraseña contra el hash de un usuario que puede no existir
 * (`null`). Siempre ejecuta una comparación real (contra un hash de relleno
 * si no hay usuario), de modo que el tiempo de respuesta no delate si la
 * cuenta existe. Devuelve `false` si no hay usuario, pase lo que pase.
 */
export async function verifyPasswordConstantTime(
  candidate: string,
  hash: string | null,
): Promise<boolean> {
  const matches = await verifyPassword(candidate, hash ?? DUMMY_PASSWORD_HASH);
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
