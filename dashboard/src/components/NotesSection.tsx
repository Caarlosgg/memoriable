import { getCategoryGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { NotesExplorer } from "./NotesExplorer";

/** Server wrapper: resuelve el workspace activo y trae la vista agrupada por categoría (el punto de partida antes de filtrar/buscar). */
export async function NotesSection({ highlightId }: { highlightId?: string }) {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const groups = await getCategoryGroups(workspaceId, highlightId);
  return <NotesExplorer initialGroups={groups} highlightId={highlightId} />;
}
