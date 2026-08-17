import { getBoardGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, listWorkspaceMembers, getHiddenCategories } from "@/lib/workspace";
import { KanbanBoard } from "./KanbanBoard";

export async function BoardSection() {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  const [columns, members] = await Promise.all([
    getHiddenCategories(userId, workspaceId).then((hidden) => getBoardGroups(workspaceId, hidden)),
    // Solo hace falta en modo equipo — en personal no hay a quién asignar.
    isPersonal ? Promise.resolve([]) : listWorkspaceMembers(workspaceId, userId).catch(() => []),
  ]);
  return <KanbanBoard initialColumns={columns} members={members} currentUserId={userId} />;
}
