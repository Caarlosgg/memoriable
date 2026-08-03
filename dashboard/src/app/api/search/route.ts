import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { searchMessages } from "@/lib/data";
import { isCategory } from "@/lib/categories";

// Fuera del matcher de proxy.ts (las rutas de API comprueban su propia
// sesión y responden 401 en JSON en vez de redirigir a /login).
export async function GET(request: NextRequest) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q === "") {
    return NextResponse.json({ query: q, results: [] });
  }

  // "todos" (o cualquier valor que no sea una categoría real) equivale a
  // sin filtro, en vez de devolver un 400 por un valor inesperado.
  const categoriaParam = request.nextUrl.searchParams.get("categoria");
  const categoria = categoriaParam && isCategory(categoriaParam) ? categoriaParam : null;

  const results = await searchMessages(q, categoria);
  return NextResponse.json({ query: q, results });
}
