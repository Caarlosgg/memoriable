import { getBoardGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { KanbanBoard } from "./KanbanBoard";

export async function BoardSection() {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const columns = await getBoardGroups(workspaceId);
  return <KanbanBoard initialColumns={columns} />;
}
