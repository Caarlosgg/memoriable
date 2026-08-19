"use client";

import { useState, useTransition } from "react";
import { Bell, StickyNote, CalendarDays, Users, ShieldCheck, MessagesSquare } from "lucide-react";
import type { NotificationType } from "@prisma/client";
import { setNotificationPref, type NotificationPrefs } from "@/app/(dashboard)/cuenta/actions";

const TYPES: { type: NotificationType; label: string; Icon: typeof Bell }[] = [
  { type: "ASSIGNED_MESSAGE", label: "Te asignan una nota o tarea", Icon: StickyNote },
  { type: "ASSIGNED_EVENTO", label: "Te asignan un evento", Icon: CalendarDays },
  { type: "ADDED_TO_TEAM", label: "Te añaden a un equipo", Icon: Users },
  { type: "ROLE_CHANGED", label: "Te cambian el rol en un equipo", Icon: ShieldCheck },
  { type: "CHAT_INVITE", label: "Te invitan a un grupo de chat", Icon: MessagesSquare },
];

/** Ausente en `prefs` = activado (comportamiento de siempre) — solo se guarda lo que se ha desactivado. */
export function NotificationPrefsForm({ initialPrefs }: { initialPrefs: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [pending, startTransition] = useTransition();

  function toggle(type: NotificationType) {
    const enabled = prefs[type] === false;
    setPrefs((prev) => ({ ...prev, [type]: enabled ? undefined : false }));
    startTransition(() => {
      void setNotificationPref(type, enabled);
    });
  }

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 flex items-center gap-1.5 font-display text-lg text-ink">
        <Bell aria-hidden size={17} /> Notificaciones
      </p>
      <p className="mb-3 text-sm text-muted">Elige qué avisos quieres recibir en la campana.</p>
      <ul className="flex flex-col gap-2">
        {TYPES.map(({ type, label, Icon }) => {
          const enabled = prefs[type] !== false;
          return (
            <li key={type} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-ink">
                <Icon aria-hidden size={15} className="text-muted" /> {label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={pending}
                onClick={() => toggle(type)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 ${
                  enabled ? "bg-accent" : "bg-paper-line"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-paper-raised shadow transition-transform ${
                    enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
