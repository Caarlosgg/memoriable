import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForIdentity, findOrCreateGoogleUser } from "@/lib/googleOAuth";
import { createSession } from "@/lib/session";
import { statesMatch } from "@/lib/timingSafeEqual";
import { OAUTH_STATE_COOKIE } from "../route";

function loginWithError(origin: string, code: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, origin));
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || !statesMatch(state, cookieState)) {
    return loginWithError(origin, "oauth");
  }

  try {
    const redirectUri = new URL("/api/auth/google/callback", origin).toString();
    const identity = await exchangeCodeForIdentity(code, redirectUri);
    if (!identity.emailVerified) {
      return loginWithError(origin, "oauth_email_no_verificado");
    }

    const userId = await findOrCreateGoogleUser(identity.email);
    await createSession(userId);
  } catch (err) {
    console.error("Fallo en el login con Google:", err);
    Sentry.captureException(err);
    return loginWithError(origin, "oauth");
  }

  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
