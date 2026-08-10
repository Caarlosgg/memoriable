"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronsUpDown, Check, Users } from "lucide-react";
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

  function handleSelect(workspaceId: string) {
    setOpen(false);
    if (workspaceId === activeWorkspaceId) return;
    startTransition(async () => {
      await setActiveWorkspace(workspaceId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          title={collapsed ? (active?.nombre ?? "Workspace") : undefined}
          className="relative flex w-full items-center gap-2 rounded-lg border border-paper-line px-3 py-2 text-sm text-ink transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
        >
          <Users aria-hidden size={16} className="shrink-0 text-muted" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left font-medium">{active?.nombre ?? "Personal"}</span>
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
        <DropdownMenuLabel>Tus espacios</DropdownMenuLabel>
        {selectable.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => handleSelect(w.id)}>
            <span className="flex-1 truncate">{w.nombre}</span>
            {w.id === activeWorkspaceId && <Check aria-hidden size={14} className="text-accent" />}
          </DropdownMenuItem>
        ))}
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
  );
}
