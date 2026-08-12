"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAssistant } from "@/components/AssistantProvider";
import { NAV_ITEMS } from "./navItems";

/**
 * Barra de pestañas inferior en móvil: con pocos destinos, se siente más
 * nativa que un menú hamburguesa (que tiene sentido con listas más largas).
 * Transición de color en CSS puro — no hace falta Framer Motion aquí.
 */
export function BottomTabs({ isPersonal }: { isPersonal: boolean }) {
  const pathname = usePathname();
  // Ahorros es siempre personal (ver lib/workspace.ts) — no tiene sentido
  // en un workspace de equipo, así que desaparece del menú al cambiar a uno.
  const items = isPersonal ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/ahorros");
  // Mismo indicador que en Sidebar.tsx (desktop) — ver ese comentario.
  const { isBusy: assistantBusy } = useAssistant();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-paper-line bg-paper-raised pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
              active ? "text-accent" : "text-muted hover:text-ink active:text-accent"
            }`}
          >
            <span className="relative">
              <item.Icon aria-hidden size={20} />
              {item.href === "/asistente" && assistantBusy && !active && (
                <span aria-label="El Asistente está pensando" className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
              )}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
