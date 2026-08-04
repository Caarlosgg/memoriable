import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionCookie, verifySessionToken } from "./session";

/**
 * Comprobación de sesión "segura" (no solo la optimista de `proxy.ts`):
 * vuelve a verificar la firma del token en el servidor y devuelve el id del
 * usuario autenticado. `redirect()` a /login si no hay sesión válida.
 * Memoizada por render con `cache()` para no repetir la verificación si
 * varios componentes la invocan en la misma petición.
 */
export const verifySession = cache(async (): Promise<string> => {
  const token = await readSessionCookie();
  const userId = await verifySessionToken(token);
  if (!userId) redirect("/login");
  return userId;
});
