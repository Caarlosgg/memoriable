"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@prisma/client";
import { Bell, CheckCheck, CalendarDays, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAsRead, markAllAsRead } from "@/app/(dashboard)/notificaciones/actions";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<Notification["type"], typeof StickyNote> = {
  ASSIGNED_MESSAGE: StickyNote,
  ASSIGNED_EVENTO: CalendarDays,
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const hasUnread = notifications.some((n) => !n.read);

  function handleClick(n: Notification) {
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

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-paper-line bg-paper-raised/60 p-10 text-center">
        <Bell aria-hidden size={28} className="text-muted" />
        <p className="text-sm text-muted">Todavía no tienes ninguna notificación.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <Button type="button" variant="secondary" size="sm" onClick={handleMarkAll} className="self-end">
          <CheckCheck aria-hidden size={14} /> Marcar todas como leídas
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {notifications.map((n) => {
          const Icon = TYPE_ICON[n.type];
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-paper-line bg-paper-raised p-3.5 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  !n.read && "bg-accent-soft/40",
                )}
              >
                <Icon aria-hidden size={16} className="mt-0.5 shrink-0 text-accent" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">{n.title}</span>
                  {n.body && <span className="truncate text-sm text-muted">{n.body}</span>}
                  <span className="text-xs text-muted">{DATE_FORMATTER.format(n.createdAt)}</span>
                </div>
                {!n.read && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
