import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { EstadoTarea, Prioridad } from "@prisma/client";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { isSessionActive } from "@/lib/sessionRevocation";
import { searchMessages } from "@/lib/data";
import { getActiveWorkspace } from "@/lib/workspace";
import { isCategory } from "@/lib/categories";
import { ESTADOS_TABLERO, PRIORIDADES } from "@/lib/kanban";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "hasta" de un `<input type=date>` llega como solo fecha (medianoche
 * UTC) — se empuja al final del día para que incluya lo guardado ese
 * mismo día, no solo hasta las 00:00.
 */
function parseHasta(value: string | null): Date | null {
  const date = parseDate(value);
  if (!date) return null;
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

// Fuera del matcher de proxy.ts (las rutas de API comprueban su propia
// sesión y responden 401 en JSON en vez de redirigir a /login).
export async function GET(request: NextRequest) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session || !(await isSessionActive(session.userId, session.issuedAt))) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const userId = session.userId;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  // "todos" (o cualquier valor que no sea uno real) equivale a sin filtro,
  // en vez de devolver un 400 por un valor inesperado.
  const params = request.nextUrl.searchParams;
  const categoriaParam = params.get("categoria");
  const categoria = categoriaParam && isCategory(categoriaParam) ? categoriaParam : null;
  const estadoParam = params.get("estado");
  const estado = (ESTADOS_TABLERO as readonly string[]).includes(estadoParam ?? "")
    ? (estadoParam as EstadoTarea)
    : null;
  const prioridadParam = params.get("prioridad");
  const prioridad = (PRIORIDADES as readonly string[]).includes(prioridadParam ?? "")
    ? (prioridadParam as Prioridad)
    : null;
  const desde = parseDate(params.get("desde"));
  const hasta = parseHasta(params.get("hasta"));
  const etiqueta = params.get("etiqueta")?.trim() || null;

  const { workspaceId } = await getActiveWorkspace(userId);
  const results = await searchMessages(workspaceId, q, { categoria, estado, prioridad, desde, hasta, etiqueta });
  return NextResponse.json({ query: q, results });
}
