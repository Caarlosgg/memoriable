"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { closeOtherSessions } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * "Cerrar sesión en el resto de dispositivos" — para quien se dejó la
 * sesión abierta en un ordenador ajeno y no quiere (o no puede) cambiar la
 * contraseña. Este dispositivo sigue dentro: la acción emite una sesión
 * nueva para él (ver closeOtherSessions).
 *
 * Confirmación en dos pasos, sin `window.confirm`: es una acción que echa
 * de verdad a otros dispositivos, y el diálogo nativo del navegador rompe
 * el estilo del resto de la app.
 */
export function CloseOtherSessionsForm() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await closeOtherSessions();
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      setConfirming(false);
    });
  }

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 flex items-center gap-1.5 font-display text-lg text-ink">
        <LogOut aria-hidden size={17} className="text-muted" />
        Sesiones abiertas
      </p>
      <p className="mb-3 text-sm text-muted">
        Si te has dejado la sesión abierta en otro móvil u ordenador, ciérralas todas desde aquí. Esta sesión, la
        que estás usando ahora, seguirá abierta.
      </p>

      {done ? (
        <p className="text-sm text-accent-strong">Listo: el resto de sesiones se han cerrado.</p>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={handleConfirm} disabled={pending}>
            {pending ? "Cerrando…" : "Sí, cerrar las demás"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Cerrar el resto de sesiones
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
