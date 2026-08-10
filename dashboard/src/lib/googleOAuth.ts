import "server-only";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { prisma } from "./prisma";
import { createPersonalWorkspace } from "./workspace";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Sin credenciales configuradas, el botón "Entrar con Google" no se muestra ni las rutas responden. */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID no está definida.");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // openid trae el id_token con el email ya verificado por Google — no
    // hace falta pedir un endpoint de perfil aparte.
    scope: "openid email",
    // Evita volver a pedir consentimiento cada vez si ya se dio antes.
    prompt: "select_account",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
}

/**
 * Intercambia el código de autorización por un id_token, lo verifica contra
 * las claves públicas de Google (JWKS, cacheadas por `jose` entre
 * peticiones) y devuelve el email ya confirmado. Lanza si algo no cuadra —
 * la ruta callback decide qué mostrar.
 */
export async function exchangeCodeForIdentity(code: string, redirectUri: string): Promise<GoogleIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Credenciales de Google OAuth no configuradas.");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google rechazó el intercambio del código (${tokenRes.status}).`);
  }
  const body: unknown = await tokenRes.json();
  const idToken = (body as { id_token?: string }).id_token;
  if (!idToken) throw new Error("Google no devolvió id_token.");

  const jwks = createRemoteJWKSet(new URL(JWKS_URI));
  const { payload } = await jwtVerify(idToken, jwks, { issuer: ISSUERS, audience: clientId });

  const email = typeof payload.email === "string" ? payload.email : null;
  if (!email) throw new Error("El id_token de Google no trae email.");

  return { email: email.toLowerCase(), emailVerified: payload.email_verified === true };
}

/**
 * Busca la cuenta por email o la crea sobre la marcha (sin contraseña: solo
 * entra por Google). Si ya existía sin verificar (registrada por email pero
 * nunca confirmada), Google ya certifica el mismo email — se marca
 * verificada también, no tiene sentido seguir bloqueándola.
 */
export async function findOrCreateGoogleUser(email: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.emailVerified) {
      await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: true } });
    }
    return existing.id;
  }
  // Cuenta + workspace personal + membership OWNER en una sola
  // transacción — mismo motivo que en registro/actions.ts: nunca debe
  // existir un User sin su espacio personal.
  return prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, passwordHash: null, emailVerified: true } });
    await createPersonalWorkspace(tx, created.id);
    return created.id;
  });
}
