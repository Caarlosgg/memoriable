"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions";
import { NAV_ITEMS } from "./navItems";

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

/** Ve si el usuario pide menos movimiento; se re-evalúa si cambia en vivo. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const prefersReducedMotion = usePrefersReducedMotion();

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
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          className="ml-auto rounded-full p-1.5 text-lg leading-none text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent text-accent-ink" : "text-ink hover:bg-accent-soft"
              }`}
            >
              <span aria-hidden className="text-lg">
                {item.emoji}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-paper-line p-3">
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Salir" : undefined}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong"
          >
            <span aria-hidden className="text-lg">
              🚪
            </span>
            {!collapsed && <span>Salir</span>}
          </button>
        </form>
      </div>
    </MotionAside>
  );
}
