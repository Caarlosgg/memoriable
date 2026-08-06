import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isGoogleOAuthConfigured, buildGoogleAuthorizeUrl } from "@/lib/googleOAuth";

export const OAUTH_STATE_COOKIE = "google_oauth_state";

/** Inicia el login con Google: guarda un `state` anti-CSRF y redirige a Google. */
export async function GET(req: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return new NextResponse("Login con Google no está configurado.", { status: 404 });
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = new URL("/api/auth/google/callback", req.nextUrl.origin).toString();
  const authorizeUrl = buildGoogleAuthorizeUrl(state, redirectUri);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return res;
}
