import { House, MessageCircle, MessagesSquare, StickyNote, ListTodo, CalendarDays, PiggyBank, Users, User, type LucideIcon } from "lucide-react";
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
}

const AMBOS: readonly Modo[] = ["personal", "equipo"];

/**
 * Compartido entre Sidebar (escritorio) y BottomTabs (móvil): una sola fuente
 * de verdad. "Notas" unifica lo que antes eran dos pantallas casi idénticas
 * (Buscador y Categorías) — ver NotesExplorer.tsx.
 *
 * El orden importa: es el que se ve de arriba abajo, y en móvil decide qué
 * entra en la barra y qué se va a "Más".
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", Icon: House, modos: AMBOS, enMovil: true },
  { href: "/asistente", label: "Asistente", Icon: MessageCircle, modos: AMBOS, enMovil: true },
  { href: "/categorias", label: "Notas", Icon: StickyNote, modos: AMBOS },
  { href: "/pendientes", label: "Tablero", Icon: ListTodo, modos: AMBOS, enMovil: true },
  { href: "/calendario", label: "Calendario", Icon: CalendarDays, modos: AMBOS, enMovil: true },
  // Ahorros es SOLO personal: el dinero ahorrado cuelga del usuario, no del
  // workspace (ver getPersonalWorkspaceId en lib/workspace.ts).
  { href: "/ahorros", label: "Ahorros", Icon: PiggyBank, modos: ["personal"], enMovil: true },
  // El chat dejó de estar atado al workspace (conversaciones y grupos son de
  // la persona, ver ChatConversation en el schema), así que vive en los dos.
  { href: "/chat", label: "Chat", Icon: MessagesSquare, modos: AMBOS, enMovil: true },
  // Equipo es SOLO de equipo: en personal no hay plantilla que gestionar. Se
  // sigue llegando desde el selector de espacios para crear el primero.
  { href: "/equipo", label: "Equipo", Icon: Users, modos: ["equipo"] },
  { href: "/cuenta", label: "Cuenta", Icon: User, modos: AMBOS },
];

/** Destinos visibles en un modo — un único sitio decide el menú de cada uno. */
export function navItemsDeModo(modo: Modo): NavItem[] {
  return NAV_ITEMS.filter((item) => item.modos.includes(modo));
}
