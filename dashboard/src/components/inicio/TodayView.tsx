import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { PersonalToday } from "./PersonalToday";
import { TeamToday } from "./TeamToday";
import { Saludo } from "./Saludo";

/**
 * Pantalla de inicio: despacha a la vista de SU modo.
 *
 * Antes era una única vista para los dos modos, y por eso "no decía nada" —
 * intentaba servir a la vez a "tu día" y a "el equipo", y una ficha llegaba
 * a mostrar "Tu equipo: 0" estando en personal, un número que no medía
 * nada. Ahora cada modo tiene su propia pantalla (PersonalToday/TeamToday);
 * lo único que comparten es el saludo y el layout de esta cabecera.
 *
 * El saludo se calcula en el CLIENTE (ver `Saludo`): el servidor está en
 * UTC, así que a la 01:30 en España daba las "buenas noches" con la fecha
 * de ayer.
 */
export async function TodayView() {
  const userId = await verifySession();
  const { workspaceId, isPersonal, role } = await getActiveWorkspace(userId);

  // El nombre no es crítico: si falla, se saluda sin él en vez de romper la
  // pantalla de inicio entera.
  const usuario = await prisma.user
    .findUnique({ where: { id: userId }, select: { nombre: true, email: true } })
    .catch(() => null);

  return (
    <div className="flex flex-col gap-5">
      <Saludo nombre={usuario ? displayName(usuario) : undefined} />

      {isPersonal ? (
        <PersonalToday workspaceId={workspaceId} />
      ) : (
        <TeamToday workspaceId={workspaceId} userId={userId} role={role} />
      )}
    </div>
  );
}
