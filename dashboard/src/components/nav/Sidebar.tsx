"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { Notification } from "@prisma/client";
import { ChevronsLeft, ChevronsRight, LogOut, Search } from "lucide-react";
import { logout } from "@/app/actions";
import type { WorkspaceSummary } from "@/app/(dashboard)/equipo/actions";
import { NAV_ITEMS } from "./navItems";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { NotificationBell } from "./NotificationBell";

// Import dinámico a propósito: framer-motion solo lo necesita el colapso del
// sidebar (una animación de ancho con física de resorte que CSS no
// reproduce bien) — el resto de transiciones del dashboard son CSS puro.
// Cargarlo así lo saca del bundle inicial en vez de bloquear la carga.
const MotionAside = dynamic(() => import("framer-motion").then((m) => m.motion.aside), {
  ssr: false,
  loading: () => <aside className="hidden w-56 shrink-0 sm:block" />,
});

const EXPANDED_WIDTH = 224;
const COLLAPSED_WIDTH = 76;

/**
 * Ve si el usuario pide menos movimiento; se re-evalúa si cambia en vivo.
 * `useSyncExternalStore` en vez de efecto+setState: es la forma pensada
 * para suscribirse a estado externo del navegador (matchMedia) sin el
 * "doble render" que dispara el lint de React sobre setState en efectos.
 */
function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);
}

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  isPersonal,
  notifications,
  unreadCount,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  isPersonal: boolean;
  notifications: Notification[];
  unreadCount: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const prefersReducedMotion = usePrefersReducedMotion();
  // Ahorros es siempre personal (ver lib/workspace.ts) — no tiene sentido
  // en un workspace de equipo, así que desaparece del menú al cambiar a uno.
  const items = isPersonal ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/ahorros");

  return (
    <MotionAside
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
      className="hidden shrink-0 flex-col border-r border-paper-line bg-paper-raised sm:flex"
    >
      <div className="flex items-center justify-between gap-2 border-b border-paper-line px-4 py-4">
        {!collapsed && (
          <h1 className="font-display text-lg font-semibold tracking-tight text-ink">MemorIAble</h1>
        )}
        {!collapsed && <NotificationBell notifications={notifications} unreadCount={unreadCount} />}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          className="ml-auto rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:bg-accent-soft"
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      <div className="p-3 pb-0">
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} collapsed={collapsed} />
      </div>

      <div className="p-3 pb-0">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          title={collapsed ? "Buscar (Ctrl+K)" : undefined}
          className="flex w-full items-center gap-3 rounded-lg border border-paper-line px-3 py-2 text-sm text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Search aria-hidden size={16} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <kbd className="rounded border border-paper-line px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
            </>
          )}
        </button>
      </div>

      <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <div key={item.href}>
              {/* Separador antes de "Cuenta": distingue el contenido (notas,
                  tablero...) de la gestión de la cuenta, sin necesitar dos
                  <nav> aparte. */}
              {item.href === "/cuenta" && <hr className="my-2 border-paper-line" />}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? "bg-accent text-accent-ink" : "text-ink hover:bg-accent-soft active:bg-accent-soft"
                }`}
              >
                <item.Icon aria-hidden size={18} className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-paper-line p-3">
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Salir" : undefined}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong active:bg-accent-soft"
          >
            <LogOut aria-hidden size={18} className="shrink-0" />
            {!collapsed && <span>Salir</span>}
          </button>
        </form>
      </div>
    </MotionAside>
  );
}
