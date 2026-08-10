import { Users } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

/**
 * "Compartido en: X" — a petición explícita del usuario: cambiar de
 * workspace con el selector no dejaba claro qué estaba pasando ni por
 * qué el contenido cambiaba. Se planta en Notas/Tablero/Calendario (las
 * secciones que sí cambian de alcance al cambiar de workspace) y no
 * pinta nada en el personal — ahí no hace falta aclarar nada, es el
 * comportamiento de toda la vida.
 */
export async function ActiveWorkspaceBadge() {
  const userId = await verifySession();
  const { isPersonal, workspaceId } = await getActiveWorkspace(userId);
  if (isPersonal) return null;

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { nombre: true } });
  if (!workspace) return null;

  return (
    <p className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-strong">
      <Users aria-hidden size={13} />
      Compartido en «{workspace.nombre}» — solo lo ven los miembros de este equipo.
    </p>
  );
}
