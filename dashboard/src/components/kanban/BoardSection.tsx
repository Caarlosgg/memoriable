import { getBoardGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { KanbanBoard } from "./KanbanBoard";

export async function BoardSection() {
  const userId = await verifySession();
  const columns = await getBoardGroups(userId);
  return <KanbanBoard initialColumns={columns} />;
}
