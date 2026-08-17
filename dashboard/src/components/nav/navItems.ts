import { House, MessageCircle, MessagesSquare, StickyNote, ListTodo, CalendarDays, PiggyBank, Users, User, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /**
   * Aparece en la barra inferior de móvil. En el menú lateral (desktop)
   * salen TODOS — ahí sobra sitio. En móvil no: con más de cinco pestañas
   * las etiquetas dejan de caber y todo se vuelve ilegible, así que el
   * resto se alcanza desde "Más" (que abre la paleta de comandos, donde
   * están todos los destinos).
   */
  enMovil?: boolean;
}

/**
 * Compartido entre Sidebar (desktop) y BottomTabs (móvil): una sola fuente
 * de verdad. "Notas" unifica lo que antes eran dos pantallas casi
 * idénticas (Buscador y Categorías) — ver NotesExplorer.tsx.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", Icon: House, enMovil: true },
  { href: "/asistente", label: "Asistente", Icon: MessageCircle, enMovil: true },
  { href: "/categorias", label: "Notas", Icon: StickyNote },
  { href: "/pendientes", label: "Tablero", Icon: ListTodo, enMovil: true },
  { href: "/calendario", label: "Calendario", Icon: CalendarDays, enMovil: true },
  // Ahorros (personal) y Chat (equipo) ocupan el mismo puesto en la lista a
  // propósito — son mutuamente excluyentes según el modo (ver Sidebar.tsx/
  // BottomTabs.tsx), así que el resto del menú no "salta" de sitio al
  // cambiar de workspace.
  { href: "/ahorros", label: "Ahorros", Icon: PiggyBank, enMovil: true },
  { href: "/chat", label: "Chat", Icon: MessagesSquare, enMovil: true },
  { href: "/equipo", label: "Equipo", Icon: Users },
  { href: "/cuenta", label: "Cuenta", Icon: User },
];
