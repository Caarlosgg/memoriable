import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

/**
 * Tokens de API personales: lo que permite que herramientas de fuera (un
 * servidor MCP, un script, otra IA) lean y escriban en MemorIAble sin una
 * sesión de navegador.
 *
 * Es la pieza que faltaba para el argumento del producto —"tu memoria, y
 * tus otras IAs tiran de ella"—: hasta ahora TODO iba por cookie, así que
 * nada externo podía integrarse.
 */

/** Prefijo visible del token. Sirve para reconocerlo de un vistazo y para que un escáner de secretos pueda detectarlo. */
const PREFIJO = "mia_";

/** Cuántos caracteres del token se guardan en claro para poder listarlo. */
const LARGO_PREFIJO_VISIBLE = PREFIJO.length + 6;

/**
 * SHA-256 y no bcrypt/argon2 a propósito, al contrario que con las
 * contraseñas: un token son 256 bits aleatorios, no algo que una persona
 * pueda recordar ni adivinar, así que no hay nada que un hash lento proteja
 * — y esto se ejecuta en CADA petición de la API, donde un KDF costoso sí
 * se notaría.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ApiTokenCreado {
  /** El token en claro. Se devuelve UNA vez: no se guarda, no se puede recuperar. */
  token: string;
  id: string;
  nombre: string;
  prefijo: string;
}

/** Nombre obligatorio: una lista de tokens sin nombre es una lista de fechas indistinguibles. */
const MAX_NOMBRE = 60;

export async function createApiToken(
  userId: string,
  nombre: string,
): Promise<{ error?: string; creado?: ApiTokenCreado }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: "Ponle un nombre al token para saber cuál es." };
  if (limpio.length > MAX_NOMBRE) return { error: `El nombre no puede tener más de ${MAX_NOMBRE} caracteres.` };

  const token = `${PREFIJO}${randomBytes(32).toString("base64url")}`;
  const fila = await prisma.apiToken.create({
    data: {
      userId,
      nombre: limpio,
      tokenHash: hashToken(token),
      prefijo: token.slice(0, LARGO_PREFIJO_VISIBLE),
    },
    select: { id: true, nombre: true, prefijo: true },
  });

  return { creado: { token, ...fila } };
}

export interface ApiTokenInfo {
  id: string;
  nombre: string;
  prefijo: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function listApiTokens(userId: string): Promise<ApiTokenInfo[]> {
  return prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, nombre: true, prefijo: true, createdAt: true, lastUsedAt: true },
  });
}

/** Revoca un token. El `where` lleva userId: un id ajeno no revoca nada. */
export async function revokeApiToken(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.apiToken.deleteMany({ where: { id, userId } });
  return count > 0;
}

/**
 * Resuelve el dueño de un token. `null` si no vale.
 *
 * Se busca por el hash (que es único e indexado) en vez de traer todos los
 * tokens y compararlos: una comparación en tiempo constante sobre el hash
 * completo no aporta nada aquí — el índice ya decide en O(log n) sin
 * filtrar por tiempo información útil, porque lo que se compara es el
 * hash, no el secreto.
 *
 * Actualiza `lastUsedAt` de forma perezosa y sin bloquear: sirve para
 * revocar con criterio los que ya no usa nadie, y no merece añadir una
 * escritura síncrona a cada petición de la API.
 */
export async function resolveApiToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
  if (!token.startsWith(PREFIJO)) return null;

  const fila = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!fila) return null;
  if (fila.expiresAt && fila.expiresAt < new Date()) return null;

  void prisma.apiToken
    .update({ where: { id: fila.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: fila.userId, tokenId: fila.id };
}

/**
 * Extrae y valida el token de una petición. Devuelve el userId o `null`.
 *
 * Acepta `Authorization: Bearer <token>`, el estándar de facto: cualquier
 * cliente de MCP o de HTTP sabe mandarlo sin configuración especial.
 */
export async function autenticarPeticion(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const resuelto = await resolveApiToken(token);
  return resuelto?.userId ?? null;
}

/** Solo para tests: comprueba que dos tokens son iguales sin filtrar por tiempo. */
export function tokensIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
