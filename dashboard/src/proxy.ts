import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * Comprobación optimista de sesión (Next.js 16 renombró Middleware a
 * Proxy; el comportamiento es el mismo). Solo lee la cookie, no toca la
 * base de datos: por eso cada Server Component protegido vuelve a llamar a
 * `verifySession()` (ver dal.ts) como comprobación "de verdad".
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await verifySessionToken(token);

  if (pathname === "/login" || pathname === "/registro") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

// No corre sobre: rutas de API (comprueban su propia sesión y responden 401
// en JSON en vez de redirigir), assets de Next, ni los recursos públicos de
// la PWA (manifest, iconos, service worker) — estos deben poder pedirse sin
// sesión (el propio SO/navegador los pide al instalar la app).
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|manifest\\.webmanifest|icon|apple-icon|icons|sw\\.js).*)",
  ],
};
