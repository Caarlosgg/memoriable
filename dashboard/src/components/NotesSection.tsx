import { getCategoryGroups } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, getHiddenCategories } from "@/lib/workspace";
import { contarComentariosPorMensaje } from "@/lib/comentarios";
import { NotesExplorer } from "./NotesExplorer";

/** Server wrapper: resuelve el workspace activo y trae la vista agrupada por categoría (el punto de partida antes de filtrar/buscar). */
export async function NotesSection({ highlightId }: { highlightId?: string }) {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const hiddenCategories = await getHiddenCategories(userId, workspaceId);
  const groups = await getCategoryGroups(workspaceId, highlightId, hiddenCategories);

  // Cuántos comentarios tiene cada nota, en UNA consulta (no una por
  // tarjeta). Sin esto, la conversación del equipo sobre una tarea era
  // invisible hasta que a alguien se le ocurría abrirla: la función que
  // cuenta comentarios existía desde que se construyó la Fase 1, pero
  // nunca se había llegado a llamar desde ninguna pantalla.
  const idsVisibles = groups.flatMap((g) => g.messages.map((m) => m.id));
  const comentariosPorMensaje = Object.fromEntries(await contarComentariosPorMensaje(idsVisibles));

  return <NotesExplorer initialGroups={groups} highlightId={highlightId} comentariosPorMensaje={comentariosPorMensaje} />;
}
