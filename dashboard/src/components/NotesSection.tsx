import { getCategoryGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { NotesExplorer } from "./NotesExplorer";

/** Server wrapper: resuelve el dueño y trae la vista agrupada por categoría (el punto de partida antes de filtrar/buscar). */
export async function NotesSection({ highlightId }: { highlightId?: string }) {
  const userId = await verifySession();
  const groups = await getCategoryGroups(userId, highlightId);
  return <NotesExplorer initialGroups={groups} highlightId={highlightId} />;
}
