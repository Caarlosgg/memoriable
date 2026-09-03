"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { eliminarMiCuenta } from "@/app/(dashboard)/cuenta/actions";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";

/**
 * Borrar la propia cuenta (RGPD).
 *
 * Con fricción a propósito, y de dos tipos distintos:
 *
 * 1. **Está plegado.** Es lo último de los ajustes y no se ve hasta
 *    pedirlo: nadie debe tropezarse con este botón buscando otra cosa.
 * 2. **Pide la contraseña** (o el email, en cuentas de Google, que no
 *    tienen contraseña que comprobar). Un "¿seguro?" no protege de nada:
 *    basta con dejar la sesión abierta un momento.
 *
 * Lo que NO se hace es esconderlo o disuadir: el derecho de supresión es
 * suyo, y los términos ya prometen que se puede hacer desde aquí.
 */
export function DeleteAccountForm({ tienePassword }: { tienePassword: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // Si sale bien, la acción redirige y esto no llega a ejecutarse.
      const result = await eliminarMiCuenta(confirmacion);
      if (result?.error) setError(result.error);
    });
  }

  if (!abierto) {
    return (
      <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
        <p className="mb-1 font-display text-lg text-ink">Eliminar mi cuenta</p>
        <p className="mb-3 text-sm text-muted">
          Se borra todo lo tuyo: notas, tareas, eventos y el historial del Asistente. No se puede
          deshacer. Si quieres quedarte una copia, expórtala antes desde aquí arriba.
        </p>
        <Button type="button" variant="secondary" onClick={() => setAbierto(true)}>
          Quiero eliminar mi cuenta
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-5"
    >
      <p className="flex items-center gap-2 font-display text-lg text-ink">
        <TriangleAlert aria-hidden size={18} className="text-danger" />
        Eliminar mi cuenta
      </p>
      <p className="text-sm text-muted">
        {tienePassword
          ? "Escribe tu contraseña para confirmar. Esto no se puede deshacer."
          : "Tu cuenta entra con Google, así que escribe tu email para confirmar. Esto no se puede deshacer."}
      </p>

      <label htmlFor="confirmar-borrado" className="text-sm font-medium text-ink">
        {tienePassword ? "Contraseña" : "Tu email"}
      </label>
      {tienePassword ? (
        <PasswordInput
          id="confirmar-borrado"
          required
          autoComplete="current-password"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
        />
      ) : (
        <Input
          id="confirmar-borrado"
          type="email"
          required
          autoComplete="email"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Cancelar primero: el pulgar y el ojo caen antes en el primer
            botón, y el primero no debe ser el irreversible. */}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setAbierto(false);
            setConfirmacion("");
            setError(null);
          }}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={pending || confirmacion.trim() === ""}
          className="bg-danger text-white hover:bg-danger disabled:opacity-60"
        >
          {pending ? "Eliminando…" : "Eliminar mi cuenta para siempre"}
        </Button>
      </div>
    </form>
  );
}
