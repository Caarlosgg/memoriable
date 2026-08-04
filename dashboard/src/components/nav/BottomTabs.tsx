"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./navItems";

/**
 * Barra de pestañas inferior en móvil: con solo 4 destinos, se siente más
 * nativa que un menú hamburguesa (que tiene sentido con listas más largas).
 * Transición de color en CSS puro — no hace falta Framer Motion aquí.
 */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-paper-line bg-paper-raised pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              active ? "text-accent" : "text-muted hover:text-ink active:text-accent"
            }`}
          >
            <item.Icon aria-hidden size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
