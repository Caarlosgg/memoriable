import { getBoardGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace, listWorkspaceMembers, getHiddenCategories, getBoardLabels, canWrite } from "@/lib/workspace";
import { parseVista } from "@/lib/kanban";
import { resolverColumnas } from "@/lib/boardColumns";
import { KanbanBoard } from "./KanbanBoard";

export async function BoardSection({ vista, asignado }: { vista?: string; asignado?: string }) {
  const userId = await verifySession();
  const { workspaceId, isPersonal, role } = await getActiveWorkspace(userId);

  // Las columnas se resuelven ANTES de agrupar: son las que deciden en qué
  // cubo cae cada tarjeta (ver columnaDeTarjeta en boardColumns.ts).
  const [statuses, boardLabels] = await Promise.all([
    prisma.boardStatus.findMany({ where: { workspaceId }, orderBy: { orden: "asc" } }),
    getBoardLabels(workspaceId),
  ]);
  const columnas = resolverColumnas(statuses, boardLabels);

  const [columns, members] = await Promise.all([
    getHiddenCategories(userId, workspaceId).then((hidden) => getBoardGroups(workspaceId, hidden, columnas)),
    // Solo hace falta en modo equipo — en personal no hay a quién asignar.
    isPersonal ? Promise.resolve([]) : listWorkspaceMembers(workspaceId, userId).catch(() => []),
  ]);

  return (
    <KanbanBoard
      initialColumns={columns}
      columnas={columnas}
      members={members}
      currentUserId={userId}
      puedeEditar={canWrite(role)}
      vistaInicial={parseVista(vista)}
      // Solo se acepta si de verdad es alguien del equipo (o el hueco de
      // "sin asignar"): un id inventado en la URL dejaría el tablero vacío
      // sin explicar por qué.
      asignadoInicial={
        asignado === "sin-asignar" || members.some((m) => m.userId === asignado) ? asignado : undefined
      }
    />
  );
}
