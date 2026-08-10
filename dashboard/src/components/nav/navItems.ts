import { MessageCircle, StickyNote, ListTodo, CalendarDays, PiggyBank, Users, User, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * Compartido entre Sidebar (desktop) y BottomTabs (móvil): una sola fuente
 * de verdad. "Notas" unifica lo que antes eran dos pantallas casi
 * idénticas (Buscador y Categorías) — ver NotesExplorer.tsx.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/asistente", label: "Asistente", Icon: MessageCircle },
  { href: "/categorias", label: "Notas", Icon: StickyNote },
  { href: "/pendientes", label: "Tablero", Icon: ListTodo },
  { href: "/calendario", label: "Calendario", Icon: CalendarDays },
  { href: "/ahorros", label: "Ahorros", Icon: PiggyBank },
  { href: "/equipo", label: "Equipo", Icon: Users },
  { href: "/cuenta", label: "Cuenta", Icon: User },
];
