import { getBoardGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { readBoardFilters } from "@/lib/kanban";
import { KanbanBoard } from "./KanbanBoard";

export async function BoardSection() {
  const userId = await verifySession();
  const [columns, user] = await Promise.all([
    getBoardGroups(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { preferenciasTablero: true } }),
  ]);
  const { categoria, prioridad } = readBoardFilters(user?.preferenciasTablero);
  return <KanbanBoard initialColumns={columns} initialFiltroCategoria={categoria} initialFiltroPrioridad={prioridad} />;
}
