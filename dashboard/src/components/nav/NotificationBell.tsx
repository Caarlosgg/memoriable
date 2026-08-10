"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Notification } from "@prisma/client";
import { Bell, CheckCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { markAsRead, markAllAsRead } from "@/app/(dashboard)/notificaciones/actions";
import { cn } from "@/lib/utils";

/**
 * Campana de notificaciones (Fase Equipo): de momento solo asignaciones —
 * sin esto, asignar una tarea/evento a alguien es mudo (no se entera hasta
 * que mira el tablero/calendario por si acaso). `notifications`/`unreadCount`
 * llegan ya resueltos desde el layout (mismo criterio que WorkspaceSwitcher):
 * un solo sitio que consulta la BD, no cada instancia de la campana.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: Notification[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleClick(n: Notification) {
    setOpen(false);
    startTransition(async () => {
      if (!n.read) await markAsRead(n.id);
      router.refresh();
    });
    if (n.link) router.push(n.link);
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllAsRead();
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notificaciones — ${unreadCount} sin leer` : "Notificaciones"}
          className="relative rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <Bell aria-hidden size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-[10px] font-bold text-accent-ink">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1 py-1">
          <DropdownMenuLabel className="p-0">Notificaciones</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-accent hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <CheckCheck aria-hidden size={12} /> Marcar todas
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2.5 py-3 text-center text-sm text-muted">Nada por aquí.</p>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onSelect={() => handleClick(n)}
              className={cn("flex-col items-start gap-0.5", !n.read && "bg-accent-soft/50")}
            >
              <span className="text-sm font-medium text-ink">{n.title}</span>
              {n.body && <span className="line-clamp-1 text-xs text-muted">{n.body}</span>}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notificaciones">Ver todas</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
