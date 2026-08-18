"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { useAssistant } from "@/components/AssistantProvider";
import { navItemsDeModo } from "./navItems";
import { modoDe } from "@/lib/modo";

/**
 * Barra de pestañas inferior en móvil: con pocos destinos, se siente más
 * nativa que un menú hamburguesa (que tiene sentido con listas más largas).
 * Transición de color en CSS puro — no hace falta Framer Motion aquí.
 */
/** Con más de 4 pestañas + "Más", las etiquetas dejan de caber en un móvil normal. */
const MAX_TABS_MOVIL = 4;

export function BottomTabs({ isPersonal, hasUnreadChat = false }: { isPersonal: boolean; hasUnreadChat?: boolean }) {
  const pathname = usePathname();
  // Mismo criterio de modo que el menú de escritorio (ver navItemsDeModo),
  // filtrado además por lo que cabe en una barra de móvil. Antes la regla de
  // modo estaba duplicada aquí y en Sidebar, y divergieron.
  const candidatos = navItemsDeModo(modoDe(isPersonal)).filter((item) => item.enMovil);
  // TOPE DURO de 4 + "Más". Al dejar de filtrar el chat por workspace, en
  // modo personal pasaban a caber 6 pestañas más "Más": en una pantalla de
  // teléfono eso son ~7 columnas de 50px, con las etiquetas partidas o
  // recortadas. El corte se hace aquí y no quitando destinos de NAV_ITEMS
  // porque en escritorio sí caben todos — y lo que se queda fuera no se
  // pierde, sigue estando en "Más" (la paleta lista TODOS los destinos).
  const items = candidatos.slice(0, MAX_TABS_MOVIL);
  // Estar EN una pantalla que se ha quedado fuera del corte (p. ej. Ahorros
  // en personal) sin que nada en la barra aparezca activo se siente roto:
  // en ese caso entra en el hueco de la última pestaña, para que siempre se
  // vea dónde estás.
  const activoFuera = candidatos.find((item) => item.href === pathname && !items.includes(item));
  const visibles = activoFuera ? [...items.slice(0, MAX_TABS_MOVIL - 1), activoFuera] : items;
  // Mismo indicador que en Sidebar.tsx (desktop) — ver ese comentario.
  const { isBusy: assistantBusy } = useAssistant();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-paper-line bg-paper-raised pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {visibles.map((item) => {
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
