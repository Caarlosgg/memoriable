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

  if (pathname === "/login" || pathname === "/registro" || pathname === "/olvide-password") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Quien pincha en el enlace del correo de confirmación/restablecer
  // contraseña nunca tiene por qué tener sesión (el de verificación se
  // manda justo después de crear la cuenta, antes de poder entrar) — sin
  // esto, el propio proxy lo mandaba a /login antes de que la página
  // llegara siquiera a comprobar el token, y la cuenta nunca se marcaba
  // verificada / la contraseña nunca se cambiaba. A diferencia de /login y
  // /registro, no redirige aunque SÍ haya sesión: alguien ya logueado en
  // otro dispositivo puede pinchar el mismo enlace sin problema.
  if (pathname === "/verificar-email" || pathname === "/restablecer-password") {
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
