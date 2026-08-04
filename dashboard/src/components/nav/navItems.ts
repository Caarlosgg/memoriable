export interface NavItem {
  href: string;
  label: string;
  emoji: string;
}

/** Compartido entre Sidebar (desktop) y BottomTabs (móvil): una sola fuente de verdad. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/asistente", label: "Asistente", emoji: "💬" },
  { href: "/buscador", label: "Buscador", emoji: "🔎" },
  { href: "/categorias", label: "Categorías", emoji: "🗃️" },
  { href: "/pendientes", label: "Pendientes", emoji: "📋" },
  { href: "/cuenta", label: "Cuenta", emoji: "👤" },
];
