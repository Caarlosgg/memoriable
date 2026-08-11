import { Users, Eye } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

/**
 * "Compartido en: X" — a petición explícita del usuario: cambiar de
 * workspace con el selector no dejaba claro qué estaba pasando ni por
 * qué el contenido cambiaba. Se planta en Notas/Tablero/Calendario (las
 * secciones que sí cambian de alcance al cambiar de workspace) y no
 * pinta nada en el personal — ahí no hace falta aclarar nada, es el
 * comportamiento de toda la vida. Con rol VIEWER, avisa además de que el
 * acceso es de solo lectura ANTES de que alguien intente guardar algo y
 * se encuentre con el error — el servidor sigue siendo quien de verdad
 * lo impide (ver canWrite en lib/workspace.ts), esto es solo el aviso.
 */
export async function ActiveWorkspaceBadge() {
  const userId = await verifySession();
  const { isPersonal, workspaceId, role } = await getActiveWorkspace(userId);
  if (isPersonal) return null;

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { nombre: true } });
  if (!workspace) return null;

  if (role === "VIEWER") {
    return (
      <p className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Eye aria-hidden size={13} />
        Compartido en «{workspace.nombre}» — acceso de solo lectura, no puedes crear ni editar aquí.
      </p>
    );
  }

  return (
    <p className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-strong">
      <Users aria-hidden size={13} />
      Compartido en «{workspace.nombre}» — solo lo ven los miembros de este equipo.
    </p>
  );
}
