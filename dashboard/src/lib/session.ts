import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { requireSessionSecret } from "./env";

export const SESSION_COOKIE_NAME = "memoria_ia_session";

/** Duración de la sesión: 30 días. Pasado ese tiempo, hay que volver a entrar. */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireSessionSecret());
}

/**
 * Crea la sesión: firma un JWT con el id del usuario autenticado y lo guarda
 * en una cookie httpOnly. Debe llamarse desde un Server Action o Route
 * Handler (no se puede escribir una cookie durante el renderizado de un
 * Server Component).
 */
export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
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
