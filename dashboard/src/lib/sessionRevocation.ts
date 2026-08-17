import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";

/**
 * Revocación de sesiones sin tabla de sesiones.
 *
 * Las sesiones son un JWT firmado que dura 30 días (ver session.ts): una
 * vez emitido, valía hasta caducar pasara lo que pasara — cambiar la
 * contraseña NO echaba de las demás sesiones abiertas. Justo al revés de
 * lo que espera cualquiera que cambia la contraseña precisamente porque
 * cree que alguien más ha entrado.
 *
 * En vez de guardar una fila por sesión (y consultarla en cada petición),
 * basta una marca por usuario: `User.sessionsValidFrom`. Todo token
 * emitido ANTES de esa marca deja de valer. Cambiar la contraseña, o
 * pulsar "cerrar sesión en el resto de dispositivos", solo tiene que
 * mover la marca a "ahora" — una escritura, sin recorrer ni invalidar
 * nada más.
 *
 * Coste: una lectura por petición (clave primaria, indexada), memoizada
 * con `cache()` para que varios componentes de la MISMA petición no la
 * repitan — mismo criterio que `getActiveWorkspace` en workspace.ts.
 *
 * Fail-open ante un fallo de BD, igual que el rate limiter: si no se
 * puede comprobar, se deja pasar. Un fallo de infraestructura no debe
 * echar de la aplicación a todo el mundo a la vez.
 */
export const isSessionActive = cache(async (userId: string, issuedAt: Date): Promise<boolean> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionsValidFrom: true } });
    // Sin usuario, la sesión apunta a una cuenta borrada — no vale.
    if (!user) return false;
    if (!user.sessionsValidFrom) return true;
    // `iat` solo tiene resolución de segundos, así que un token emitido en
    // el MISMO segundo que la revocación podría descartarse por unos
    // milisegundos. Se compara con un margen de 1s a favor del token: la
    // sesión que se acaba de crear al cambiar la contraseña (ver
    // changePassword) no debe morir por ese redondeo.
    return issuedAt.getTime() + 1000 >= user.sessionsValidFrom.getTime();
  } catch (err) {
    console.error("No se pudo comprobar si la sesión sigue activa (se deja pasar):", err);
    return true;
  }
});

/**
 * Invalida TODAS las sesiones del usuario emitidas hasta ahora. Quien la
 * llama es responsable de crear una sesión nueva después si el propio
 * dispositivo debe seguir dentro (ver changePassword).
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionsValidFrom: new Date() } });
}
