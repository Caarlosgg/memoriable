import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionCookie, verifySessionToken } from "./session";
import { isSessionActive } from "./sessionRevocation";
import { prisma } from "./prisma";

/**
 * Comprobación de sesión "segura" (no solo la optimista de `proxy.ts`):
 * vuelve a verificar la firma del token en el servidor, comprueba que la
 * sesión no haya sido revocada (cambio de contraseña, "cerrar sesión en el
 * resto de dispositivos" — ver sessionRevocation.ts) y devuelve el id del
 * usuario autenticado. `redirect()` a /login si algo de eso falla.
 * Memoizada por render con `cache()` para no repetir ni la verificación ni
 * la consulta si varios componentes la invocan en la misma petición.
 */
export const verifySession = cache(async (): Promise<string> => {
  const token = await readSessionCookie();
  const session = await verifySessionToken(token);
  if (!session) redirect("/login");
  if (!(await isSessionActive(session.userId, session.issuedAt))) redirect("/login");
  return session.userId;
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
  if (!user?.isSuperAdmin) redirect("/inicio");
  return userId;
});
