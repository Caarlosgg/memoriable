import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { get } from "@vercel/blob";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { isSessionActive } from "@/lib/sessionRevocation";

// Fuera del matcher de proxy.ts (ver api/search/route.ts): comprueba su
// propia sesión y responde 401/404 en vez de redirigir a /login. Sirve las
// imágenes subidas a Vercel Blob (ver blobUpload.ts) — el almacén es
// privado, así que la URL directa del blob no funciona sin este proxy.
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session || !(await isSessionActive(session.userId, session.issuedAt))) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { path } = await params;
  const pathname = path.join("/");
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Cache-Control": "private, no-cache",
    },
  });
}
