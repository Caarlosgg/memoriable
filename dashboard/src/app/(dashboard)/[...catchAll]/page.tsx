import { notFound } from "next/navigation";

/**
 * Comodín para cualquier URL dentro de `(dashboard)` que no matchea ninguna
 * ruta real. Sin esto, una URL inexistente no "matchea" NADA dentro del
 * grupo — Next.js bubblea directo al `not-found.tsx` de la raíz, que no
 * lleva Sidebar/BottomTabs, así que un usuario logueado que teclea mal una
 * URL se queda sin el menú, como si hubiera perdido la sesión. Al llamar
 * aquí a `notFound()`, este segmento SÍ matchea (dentro del layout con
 * sidebar) y el error se resuelve con `(dashboard)/not-found.tsx`.
 */
export default function CatchAll(): never {
  notFound();
}
