import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionCookie, verifySessionToken } from "./session";
import { prisma } from "./prisma";

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

/**
 * Como `verifySession`, pero además exige `User.isSuperAdmin` — la puerta
 * de entrada a /admin (gestión global de usuarios/equipos, fuera del
 * alcance de un OWNER/ADMIN normal de workspace). Quien esté autenticado
 * pero no sea superadmin se redirige al inicio de la app, no a /login (SÍ
 * tiene sesión válida, solo no tiene este permiso).
 */
export const requireSuperAdmin = cache(async (): Promise<string> => {
  const userId = await verifySession();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (!user?.isSuperAdmin) redirect("/asistente");
  return userId;
});
