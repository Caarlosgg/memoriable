import { redirect } from "next/navigation";

/**
 * Buscador y Categorías se unificaron en una sola vista (NotesExplorer,
 * en /categorias): el filtro de texto vive ahí ahora. Se mantiene esta
 * ruta como redirección por si queda algún enlace/marcador antiguo.
 */
export default function BuscadorPage() {
  redirect("/categorias");
}
