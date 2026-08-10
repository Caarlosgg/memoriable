import { getBoardGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { getWorkspaceMembers } from "@/app/(dashboard)/equipo/actions";
import { KanbanBoard } from "./KanbanBoard";

export async function BoardSection() {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  const [columns, members] = await Promise.all([
    getBoardGroups(workspaceId),
    // Solo hace falta en modo equipo — en personal no hay a quién asignar.
    isPersonal ? Promise.resolve([]) : getWorkspaceMembers(workspaceId).catch(() => []),
  ]);
  return <KanbanBoard initialColumns={columns} members={members} />;
}
