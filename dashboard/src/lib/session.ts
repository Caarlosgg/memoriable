import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { requireSessionSecret } from "./env";

export const SESSION_COOKIE_NAME = "memoria_ia_session";

/** Duración de la sesión con "Recordarme": 30 días. */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Duración sin "Recordarme": 12 horas. Suficiente para una jornada entera
 * (que es el caso que importa: no querer que la sesión se caiga a media
 * tarde) y corta para un ordenador compartido, que es de lo que protege la
 * casilla.
 */
const SESSION_SHORT_DURATION_MS = 12 * 60 * 60 * 1000;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireSessionSecret());
}

/**
 * Crea la sesión: firma un JWT con el id del usuario autenticado y lo guarda
 * en una cookie httpOnly. Debe llamarse desde un Server Action o Route
 * Handler (no se puede escribir una cookie durante el renderizado de un
 * Server Component).
 *
 * `recordar` por defecto true: quien no dice nada (login con Google,
 * confirmación de email) mantiene el comportamiento de siempre — solo el
 * formulario de entrar, que sí tiene casilla, puede pedir la sesión corta.
 * La caducidad va tanto en el JWT como en la cookie: borrar la cookie a mano
 * para "alargar" la sesión no sirve de nada, el token también expira.
 */
export async function createSession(userId: string, recordar = true): Promise<void> {
  const expiresAt = new Date(Date.now() + (recordar ? SESSION_DURATION_MS : SESSION_SHORT_DURATION_MS));
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Cierra la sesión borrando la cookie. */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Lee el valor crudo de la cookie de sesión de la petición actual. */
export async function readSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export interface SessionPayload {
  userId: string;
  /** Cuándo se emitió el token (`iat`) — lo usa la revocación de sesiones (ver sessionRevocation.ts). */
  issuedAt: Date;
}

/**
 * Verifica un token de sesión y devuelve el usuario autenticado + cuándo
 * se emitió, o `null` si no hay sesión válida. Usable tanto desde
 * `cookies()` (Server Components/Actions) como desde `NextRequest.cookies`
 * (Proxy), por eso recibe el valor ya extraído en vez de leerlo él mismo.
 *
 * Deliberadamente SIN tocar la base de datos: esto corre también en el
 * Proxy, en cada petición. Que la sesión no haya sido revocada se
 * comprueba aparte, y solo donde de verdad importa (ver
 * `assertSessionActive` en sessionRevocation.ts).
 */
export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.iat !== "number") return null;
    // `iat` viaja en segundos (estándar JWT), Date trabaja en milisegundos.
    return { userId: payload.userId, issuedAt: new Date(payload.iat * 1000) };
  } catch {
    return null;
  }
}
