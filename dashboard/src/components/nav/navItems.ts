import { MessageCircle, Search, LayoutGrid, ListTodo, User, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/** Compartido entre Sidebar (desktop) y BottomTabs (móvil): una sola fuente de verdad. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/asistente", label: "Asistente", Icon: MessageCircle },
  { href: "/buscador", label: "Buscador", Icon: Search },
  { href: "/categorias", label: "Categorías", Icon: LayoutGrid },
  { href: "/pendientes", label: "Tablero", Icon: ListTodo },
  { href: "/cuenta", label: "Cuenta", Icon: User },
];
