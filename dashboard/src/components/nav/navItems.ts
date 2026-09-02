import { House, MessageCircle, StickyNote, ListTodo, CalendarDays, Users, User, type LucideIcon } from "lucide-react";
import type { Modo } from "@/lib/modo";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /**
   * En qué modos aparece este destino. Antes esto vivía como un `if` suelto
   * repetido en Sidebar y BottomTabs (`if (item.href === "/ahorros") return
   * isPersonal`), así que cada sitio podía divergir del otro — y de hecho
   * divergieron. Ahora la regla vive con el destino, en un único sitio.
   */
  modos: readonly Modo[];
  /**
   * Aparece en la barra inferior de móvil. En el menú lateral (escritorio)
   * salen todos los del modo actual; en móvil no caben, así que se recorta a
   * unos pocos y el resto se alcanza desde "Más" (que abre la paleta de
   * comandos, donde están TODOS los destinos).
   */
  enMovil?: boolean;
  /**
   * Sin marcar = núcleo (captura, asistente, notas/búsqueda, calendario).
   * "secundario" agrupa lo que no lidera la promoción del producto (tablero,
   * equipo) — siguen íntegros y a un clic, solo después de un separador en
   * Sidebar (ver ese componente) en vez de al mismo nivel.
   */
  grupo?: "secundario";
}

const AMBOS: readonly Modo[] = ["personal", "equipo"];

/**
 * Compartido entre Sidebar (escritorio) y BottomTabs (móvil): una sola fuente
 * de verdad. "Notas" unifica lo que antes eran dos pantallas casi idénticas
 * (Buscador y Categorías) — ver NotesExplorer.tsx.
 *
 * El orden importa: es el que se ve de arriba abajo, y en móvil decide qué
 * entra en la barra y qué se va a "Más". Núcleo primero (a Notas se le dio
 * `enMovil` para que quepa en los 4 huecos fijos; antes se quedaba fuera y
 * Tablero sí entraba, justo al revés de lo que pesa cada uno en el producto).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", Icon: House, modos: AMBOS, enMovil: true },
  { href: "/asistente", label: "Asistente", Icon: MessageCircle, modos: AMBOS, enMovil: true },
  { href: "/notas", label: "Notas", Icon: StickyNote, modos: AMBOS, enMovil: true },
  { href: "/calendario", label: "Calendario", Icon: CalendarDays, modos: AMBOS, enMovil: true },
  // A partir de aquí, secundario: sigue en el menú y en "Más" del móvil
  // (enMovil se mantiene para que, si estás EN una de estas pantallas, la
  // pestaña de móvil te siga marcando dónde estás — ver "activoFuera" en
  // BottomTabs.tsx), pero ya no ocupa uno de los 4 huecos fijos.
  { href: "/pendientes", label: "Tablero", Icon: ListTodo, modos: AMBOS, enMovil: true, grupo: "secundario" },
  // Ahorros ya NO está en el menú: no encaja en "la memoria de trabajo de tu
  // equipo" (ver el plan de producto). La ruta y los datos siguen intactos —
  // se llega por URL directa — pero deja de ser producto.
  // Equipo es SOLO de equipo: en personal no hay plantilla que gestionar. Se
  // sigue llegando desde el selector de espacios para crear el primero.
  { href: "/equipo", label: "Equipo", Icon: Users, modos: ["equipo"], grupo: "secundario" },
  { href: "/cuenta", label: "Cuenta", Icon: User, modos: AMBOS },
];

/** Destinos visibles en un modo — un único sitio decide el menú de cada uno. */
export function navItemsDeModo(modo: Modo): NavItem[] {
  return NAV_ITEMS.filter((item) => item.modos.includes(modo));
}
