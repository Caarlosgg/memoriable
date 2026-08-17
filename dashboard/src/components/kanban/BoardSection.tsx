import { getBoardGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, listWorkspaceMembers, getHiddenCategories, getBoardLabels, canWrite } from "@/lib/workspace";
import { KanbanBoard } from "./KanbanBoard";

export async function BoardSection() {
  const userId = await verifySession();
  const { workspaceId, isPersonal, role } = await getActiveWorkspace(userId);
  const [columns, members, boardLabels] = await Promise.all([
    getHiddenCategories(userId, workspaceId).then((hidden) => getBoardGroups(workspaceId, hidden)),
    // Solo hace falta en modo equipo — en personal no hay a quién asignar.
    isPersonal ? Promise.resolve([]) : listWorkspaceMembers(workspaceId, userId).catch(() => []),
    getBoardLabels(workspaceId),
  ]);
  return (
    <KanbanBoard
      initialColumns={columns}
      members={members}
      currentUserId={userId}
      boardLabels={boardLabels}
      canRenameColumns={canWrite(role)}
    />
  );
}
