"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronsUpDown, Check } from "lucide-react";
import { modoDe, MODO_PRESENTATION } from "@/lib/modo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { setActiveWorkspace, type WorkspaceSummary } from "@/app/(dashboard)/equipo/actions";

/**
 * Selector de workspace (Fase Equipo) en el Sidebar/MobileHeader: Personal +
 * cada equipo activo, con aviso si hay invitaciones sin aceptar. Cambiar de
 * workspace recarga la pantalla actual (`router.refresh()`) — cada sección
 * lee sus datos del workspace activo en el servidor, no hay estado de
 * cliente que sincronizar aparte.
 */
export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  collapsed,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  const selectable = workspaces.filter((w) => w.status === "ACTIVE");
  const invitations = workspaces.filter((w) => w.status === "PENDING");
  // El selector es lo único que dice en qué CONTEXTO estás. Antes usaba el
  // mismo icono  para tu espacio personal y para un equipo, así que
  // cambiar de uno a otro no se notaba — y con el contenido cambiando debajo,
  // eso confunde. Ahora el icono y el color son los del modo (ver lib/modo.ts).
  const modo = modoDe(active?.personal ?? true);
  const { Icon: ModoIcon, acento, descripcion } = MODO_PRESENTATION[modo];
  // Personal siempre primero y separado: no es "un espacio más" de la lista,
  // es el tuyo.
  const personal = selectable.filter((w) => w.personal);
  const equipos = selectable.filter((w) => !w.personal);

  function handleSelect(workspaceId: string) {
    setOpen(false);
    if (workspaceId === activeWorkspaceId) return;
    startTransition(async () => {
      await setActiveWorkspace(workspaceId);
      router.refresh();
    });
  }

  return (
    <>
      {/* `router.refresh()` va envuelto en una transición (ver handleSelect) —
          React suprime a propósito el fallback de Suspense durante una
          transición (evita el parpadeo de skeleton), así que sin esto
          cambiar de equipo no daba NINGUNA señal de que algo estaba
          pasando hasta que el contenido nuevo aparecía de golpe. */}
      {pending && (
        <div
          aria-hidden
          className="animate-pulse fixed inset-x-0 top-0 z-50 h-0.5 bg-accent motion-reduce:animate-none"
        />
      )}
      <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          title={collapsed ? (active?.nombre ?? "Workspace") : undefined}
          aria-label={`Cambiar de espacio de trabajo. Activo: ${active?.nombre ?? "Personal"}.`}
          className="relative flex w-full items-center gap-2 rounded-lg border border-paper-line px-3 py-2 text-sm text-ink transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
        >
          <ModoIcon aria-hidden size={16} className={`shrink-0 ${acento}`} />
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate font-medium leading-tight">{active?.nombre ?? "Personal"}</span>
                <span className="truncate text-[11px] leading-tight text-muted">{descripcion}</span>
              </span>
              <ChevronsUpDown aria-hidden size={14} className="shrink-0 text-muted" />
            </>
          )}
          {invitations.length > 0 && (
            <span
              aria-label={`${invitations.length} invitaciones pendientes`}
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-[10px] font-bold text-accent-ink"
            >
              {invitations.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Tu espacio</DropdownMenuLabel>
        {personal.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => handleSelect(w.id)}>
            <MODO_PRESENTATION.personal.Icon aria-hidden size={14} className={MODO_PRESENTATION.personal.acento} />
            <span className="flex-1 truncate">{w.nombre}</span>
            {w.id === activeWorkspaceId && <Check aria-hidden size={14} className="text-accent" />}
          </DropdownMenuItem>
        ))}
        {equipos.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tus equipos</DropdownMenuLabel>
            {equipos.map((w) => (
              <DropdownMenuItem key={w.id} onSelect={() => handleSelect(w.id)}>
                <MODO_PRESENTATION.equipo.Icon aria-hidden size={14} className={MODO_PRESENTATION.equipo.acento} />
                <span className="flex-1 truncate">{w.nombre}</span>
                {w.id === activeWorkspaceId && <Check aria-hidden size={14} className="text-accent" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {invitations.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/equipo" className="font-medium text-highlight-strong">
                {invitations.length === 1
                  ? "Tienes 1 invitación pendiente"
                  : `Tienes ${invitations.length} invitaciones pendientes`}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/equipo">Crear o gestionar equipos</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
