import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { requireDashboardPassword } from "./env";

export const SESSION_COOKIE_NAME = "memoria_ia_session";

/** Duración de la sesión: 30 días. Pasado ese tiempo, hay que volver a entrar. */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireDashboardPassword());
}

/**
 * Crea la sesión: firma un JWT mínimo (sin datos personales, solo la marca
 * de autenticado) y lo guarda en una cookie httpOnly. Debe llamarse desde un
 * Server Action o Route Handler (no se puede escribir una cookie durante el
 * renderizado de un Server Component).
 */
export async function createSession(): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await new SignJWT({ authenticated: true })
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

/**
 * Verifica un token de sesión. Usable tanto desde `cookies()` (Server
 * Components/Actions) como desde `NextRequest.cookies` (Proxy), por eso
 * recibe el valor ya extraído en vez de leerlo él mismo.
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
