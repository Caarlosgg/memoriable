"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@prisma/client";
import {
  Bell,
  CheckCheck,
  CalendarDays,
  StickyNote,
  Users,
  ShieldCheck,
  MessagesSquare,
  AlarmClock,
  Undo2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  markAsRead,
  markAllAsRead,
  markAsUnread,
  deleteNotification,
} from "@/app/(dashboard)/notificaciones/actions";
import { cn } from "@/lib/utils";
import { haceCuanto } from "@/lib/format";

const TYPE_ICON: Record<Notification["type"], typeof StickyNote> = {
  ASSIGNED_MESSAGE: StickyNote,
  ASSIGNED_EVENTO: CalendarDays,
  ADDED_TO_TEAM: Users,
  ROLE_CHANGED: ShieldCheck,
  DUE_SOON: AlarmClock,
  // El chat se retiró del producto (ver el modelo Comentario en
  // schema.prisma), pero el valor del enum sigue en la base de datos y
  // puede haber notificaciones antiguas con él — se siguen pintando, solo
  // que ya sin los botones de aceptar/rechazar.
  CHAT_INVITE: MessagesSquare,
};

/**
 * Sin `timeZone` a propósito: se usa la del NAVEGADOR, que es la del
 * usuario. Estaba fijada a "UTC", así que toda notificación salía una o dos
 * horas desfasada — "te asignaron esto a las 9:15" cuando fue a las 11:15.
 * Este componente es de cliente, así que aquí sí se puede saber la zona
 * real de quien mira.
 */
const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function NotificationsList({
  notifications,
}: {
  notifications: Notification[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const hasUnread = notifications.some((n) => !n.read);

  /** Lanza una acción de fila y refresca — el patrón común de los botones de cada notificación. */
  function run(accion: () => Promise<void>) {
    startTransition(async () => {
      await accion();
      router.refresh();
    });
  }

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
        <p className="text-sm text-muted">
          Todavía no tienes ninguna notificación.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleMarkAll}
          className="self-end"
        >
          <CheckCheck aria-hidden size={14} /> Marcar todas como leídas
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {notifications.map((n) => {
          const Icon = TYPE_ICON[n.type];

          return (
            <li key={n.id} className="group/notif relative">
              <button
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-paper-line bg-paper-raised p-3.5 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  !n.read && "bg-accent-soft/40",
                )}
              >
                <Icon
                  aria-hidden
                  size={16}
                  className="mt-0.5 shrink-0 text-accent"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">
                    {n.title}
                  </span>
                  {n.body && (
                    <span className="truncate text-sm text-muted">
                      {n.body}
                    </span>
                  )}
                  {/* Relativa, con la fecha exacta en el title: al mirar la
                      bandeja la pregunta es "¿cuándo pasó esto?", y
                      "03/09/2026, 11:15" no la responde de un vistazo. */}
                  <span className="text-xs text-muted" title={DATE_FORMATTER.format(n.createdAt)}>
                    {haceCuanto(n.createdAt)}
                  </span>
                </div>
                {!n.read && (
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                  />
                )}
              </button>

              {/* FUERA del botón principal, no dentro: si estuvieran dentro,
                  pulsarlas navegaría además a la notificación. Aparecen al
                  pasar por encima o al enfocar con teclado, para no llenar
                  la bandeja de iconos. */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/notif:opacity-100">
                {n.read && (
                  <button
                    type="button"
                    aria-label={`Marcar como no leída: ${n.title}`}
                    title="Marcar como no leída"
                    onClick={() => run(() => markAsUnread(n.id))}
                    className="rounded-full bg-paper p-1.5 text-muted transition-colors hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  >
                    <Undo2 aria-hidden size={13} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Borrar la notificación: ${n.title}`}
                  title="Borrar"
                  onClick={() => run(() => deleteNotification(n.id))}
                  className="rounded-full bg-paper p-1.5 text-muted transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <Trash2 aria-hidden size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
