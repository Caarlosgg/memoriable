import type { ReactNode } from "react";
import { InfoTooltip } from "./ui/info-tooltip";

/**
 * Título visible de cada sección del dashboard, con un icono de ayuda que
 * explica qué es y cómo se usa — ninguna sección tenía título propio antes
 * (solo el resaltado del Sidebar indicaba dónde estabas), así que esto
 * también da un sitio natural donde poner la ayuda contextual.
 *
 * `<h2>`, no `<h1>`: el Sidebar/MobileHeader ya declaran "MemorIAble" como
 * `<h1>` en todas las páginas del dashboard — este es el título de la
 * SECCIÓN dentro de esa página, un nivel por debajo.
 */
export function PageHeader({ title, help }: { title: string; help: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <InfoTooltip>{help}</InfoTooltip>
    </div>
  );
}
