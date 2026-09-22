import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { get } from "@vercel/blob";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { isSessionActive } from "@/lib/sessionRevocation";
import { isActiveMember } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

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

  // No basta con "hay sesión": sin esto, cualquier cuenta que conociera o
  // adivinara la URL de un blob ajeno (un log, una captura, una URL
  // filtrada entre workspaces) podía servírsela igual. Dos caminos válidos,
  // no uno:
  //  1. Quien la subió: `pathPrefix` es `notas/<userId>` (ver
  //     blobUpload.ts) — cubre la vista previa en el modal de edición
  //     ANTES de guardar la nota, cuando `imagenes` todavía no se ha
  //     persistido (updateMessage se llama al guardar, no al subir).
  //  2. Cualquier miembro ACTIVO del workspace de la nota que ya la tiene
  //     adjunta — una imagen de equipo debe poder verla cualquier
  //     miembro, no solo quien la subió.
  const esQuienLaSubio = pathname.startsWith(`notas/${session.userId}/`);
  if (!esQuienLaSubio) {
    const nota = await prisma.message.findFirst({
      where: { imagenes: { has: `/api/blob/${pathname}` } },
      select: { workspaceId: true },
    });
    if (!nota || !(await isActiveMember(session.userId, nota.workspaceId))) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }
  }

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
