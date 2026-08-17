"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { useAssistant } from "@/components/AssistantProvider";
import { NAV_ITEMS } from "./navItems";

/**
 * Barra de pestañas inferior en móvil: con pocos destinos, se siente más
 * nativa que un menú hamburguesa (que tiene sentido con listas más largas).
 * Transición de color en CSS puro — no hace falta Framer Motion aquí.
 */
export function BottomTabs({ isPersonal, hasUnreadChat = false }: { isPersonal: boolean; hasUnreadChat?: boolean }) {
  const pathname = usePathname();
  // Ahorros es siempre personal y Chat siempre de equipo (ver
  // lib/workspace.ts) — cada uno desaparece del menú en el modo contrario.
  const items = NAV_ITEMS.filter((item) => {
    if (!item.enMovil) return false;
    if (item.href === "/ahorros") return isPersonal;
    if (item.href === "/chat") return !isPersonal;
    return true;
  });
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
              {((item.href === "/asistente" && assistantBusy) || (item.href === "/chat" && hasUnreadChat)) &&
                !active && (
                  <span
                    aria-label={item.href === "/asistente" ? "El Asistente está pensando" : "Hay mensajes de chat sin leer"}
                    className="absolute -right-0.5 -top-0.5 flex h-2 w-2"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                )}
            </span>
            {item.label}
          </Link>
        );
      })}
      {/* "Más": Notas, Equipo y Cuenta no caben como pestaña sin dejar
          ilegibles a las demás. Abre la paleta de comandos, que ya lista
          TODOS los destinos (y además busca) — así nada queda inalcanzable
          desde el móvil. */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
        className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-none active:text-accent"
      >
        <Ellipsis aria-hidden size={20} />
        Más
      </button>
    </nav>
  );
}
