"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { setWeeklyDigestEmail } from "@/app/(dashboard)/cuenta/actions";

/**
 * Resumen semanal por correo (ver weeklyDigest.ts): "cuánto has guardado,
 * qué vence pronto", los domingos. Control aparte de
 * `NotificationPrefsForm` a propósito — ese es específicamente "qué avisos
 * quieres en la campana" (dentro de la app); esto es un canal distinto
 * (correo), y activado por defecto como cualquier aviso nuevo.
 */
export function WeeklyDigestToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(() => {
      void setWeeklyDigestEmail(next);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-paper-line bg-paper-raised p-5">
      <span className="flex items-center gap-2 text-sm text-ink">
        <Mail aria-hidden size={15} className="text-muted" />
        Resumen semanal por correo — cuánto has guardado, qué vence pronto, los domingos.
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={toggle}
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
    </div>
  );
}
