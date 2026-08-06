"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, PiggyBank, Target } from "lucide-react";
import { formatCentimos, parseEurosToCentimos } from "@/lib/money";
import type { CuentaConSaldo } from "@/lib/ahorros";
import { createCuenta } from "@/app/(dashboard)/ahorros/actions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CuentaDetailDialog } from "./CuentaDetailDialog";

/**
 * "Ahorros": varias cuentas/buckets con nombre propio en vez de un único
 * número — "diversificar" cuentas, a petición del usuario. El saldo de
 * cada una se calcula del historial de movimientos (ver lib/ahorros.ts),
 * nunca se guarda suelto.
 */
export function AhorrosSection({ cuentas }: { cuentas: (CuentaConSaldo & { tendencia: string | null })[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [nombre, setNombre] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const totalCentimos = cuentas.reduce((sum, c) => sum + c.saldoCentimos, 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const objetivoCentimos = objetivo.trim() ? parseEurosToCentimos(objetivo) : null;
    if (objetivo.trim() && objetivoCentimos === null) {
      setError("El objetivo no es un importe válido.");
      return;
    }
    setPending(true);
    const result = await createCuenta(nombre, objetivoCentimos);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNombre("");
    setObjetivo("");
    setCreating(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="ahorros-heading" className="fade-in flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm">
        <h2
          id="ahorros-heading"
          className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
        >
          <PiggyBank aria-hidden size={14} /> Ahorros
        </h2>
        <p className="font-display text-3xl font-semibold text-ink">{formatCentimos(totalCentimos)}</p>
        <p className="text-xs text-muted">
          En {cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}
        </p>
      </div>

      {cuentas.length === 0 && !creating && (
        <div className="rounded-xl border border-dashed border-paper-line bg-paper-raised/60 p-8 text-center">
          <p className="text-muted">
            Todavía no tienes ninguna cuenta de ahorro. Crea la primera para
            empezar a llevar la cuenta — un fondo de emergencia, un viaje,
            lo que sea.
          </p>
        </div>
      )}

      {cuentas.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((cuenta) => {
            const progreso =
              cuenta.objetivoCentimos && cuenta.objetivoCentimos > 0
                ? Math.min(100, Math.max(0, (cuenta.saldoCentimos / cuenta.objetivoCentimos) * 100))
                : null;
            return (
              <CuentaDetailDialog key={cuenta.id} cuenta={cuenta} onChanged={() => router.refresh()}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 rounded-xl border border-paper-line bg-paper-raised p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <p className="text-sm font-medium text-ink">{cuenta.nombre}</p>
                  <p className="font-display text-xl font-semibold text-accent-strong">
                    {formatCentimos(cuenta.saldoCentimos)}
                  </p>
                  {progreso !== null && (
                    <div className="flex flex-col gap-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-paper-line">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${progreso}%` }} />
                      </div>
                      <p className="flex items-center gap-1 text-[11px] text-muted">
                        <Target aria-hidden size={10} /> {progreso.toFixed(0)}% de {formatCentimos(cuenta.objetivoCentimos!)}
                      </p>
                    </div>
                  )}
                  {cuenta.tendencia && (
                    <p
                      className={`text-[11px] font-medium ${cuenta.tendencia.startsWith("↑") ? "text-accent-strong" : "text-muted"}`}
                    >
                      {cuenta.tendencia}
                    </p>
                  )}
                </button>
              </CuentaDetailDialog>
            );
          })}
        </div>
      )}

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-2 rounded-xl border border-paper-line bg-paper-raised p-4 shadow-sm sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="cuenta-nombre" className="text-sm font-medium text-ink">
              Nombre
            </label>
            <Input
              id="cuenta-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Fondo de emergencia, viaje, boda…"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cuenta-objetivo" className="text-sm font-medium text-ink">
              Objetivo (opcional)
            </label>
            <Input
              id="cuenta-objetivo"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="0,00 €"
              inputMode="decimal"
              className="w-32"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger sm:basis-full">
              {error}
            </p>
          )}
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setCreating(true)} className="self-start">
          <Plus aria-hidden size={15} /> Nueva cuenta
        </Button>
      )}
    </section>
  );
}
