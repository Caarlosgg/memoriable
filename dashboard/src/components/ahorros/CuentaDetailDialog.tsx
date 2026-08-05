"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MovimientoAhorro } from "@prisma/client";
import { Trash2, TrendingUp, TrendingDown, Target } from "lucide-react";
import { formatDate } from "@/lib/format";
import { formatCentimos, parseEurosToCentimos } from "@/lib/money";
import type { CuentaConSaldo } from "@/lib/ahorros";
import { addMovimiento, deleteCuenta, listMovimientos } from "@/app/(dashboard)/ahorros/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/**
 * Detalle de una cuenta de ahorro: saldo, progreso hacia el objetivo (si
 * hay), historial de movimientos (bajo demanda, no viene precargado — ver
 * listMovimientos) y un formulario para añadir ingresos/retiradas.
 */
export function CuentaDetailDialog({
  cuenta,
  children,
  onChanged,
}: {
  cuenta: CuentaConSaldo;
  children: ReactNode;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [movimientos, setMovimientos] = useState<MovimientoAhorro[] | null>(null);
  // Aparte de `movimientos`: un fallo de red no es lo mismo que "esta cuenta
  // no tiene movimientos todavía" — confundirlos hacía parecer vacía una
  // cuenta cuyo historial en realidad no se pudo cargar.
  const [historialError, setHistorialError] = useState(false);
  const [historialAttempt, setHistorialAttempt] = useState(0);
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [tipo, setTipo] = useState<"ingreso" | "retirada">("ingreso");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    // No se resetea a `null` antes de pedirlo: este modal es una instancia
    // por cuenta (cada tarjeta tiene la suya), así que lo que hubiera antes
    // es del mismo historial — se ve un instante mientras llega lo nuevo,
    // en vez de un salto a "cargando" cada vez que se reabre.
    if (!open) return;
    let cancelado = false;
    listMovimientos(cuenta.id)
      .then((data) => {
        if (cancelado) return;
        setMovimientos(data);
        setHistorialError(false);
      })
      .catch((err) => {
        if (cancelado) return;
        console.error("No se pudo cargar el historial:", err);
        setHistorialError(true);
      });
    return () => {
      cancelado = true;
    };
  }, [open, cuenta.id, historialAttempt]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setConcepto("");
      setImporte("");
      setTipo("ingreso");
      setError(null);
      setConfirmingDelete(false);
    }
  }

  async function handleAddMovimiento(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const centimos = parseEurosToCentimos(importe);
    if (centimos === null || centimos <= 0) {
      setError("Escribe una cantidad válida, mayor que cero.");
      return;
    }
    setPending(true);
    const result = await addMovimiento(cuenta.id, tipo === "ingreso" ? centimos : -centimos, concepto || null);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConcepto("");
    setImporte("");
    onChanged();
    // Refresca el historial dentro del propio modal, sin cerrarlo.
    listMovimientos(cuenta.id)
      .then((data) => {
        setMovimientos(data);
        setHistorialError(false);
      })
      .catch((err) => {
        console.error("No se pudo refrescar el historial:", err);
        setHistorialError(true);
      });
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setPending(true);
    const result = await deleteCuenta(cuenta.id);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
    setOpen(false);
  }

  const progreso =
    cuenta.objetivoCentimos && cuenta.objetivoCentimos > 0
      ? Math.min(100, Math.max(0, (cuenta.saldoCentimos / cuenta.objetivoCentimos) * 100))
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cuenta.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <p className="font-display text-2xl font-semibold text-ink">{formatCentimos(cuenta.saldoCentimos)}</p>
            {progreso !== null && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-paper-line">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progreso}%` }} />
                </div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Target aria-hidden size={12} /> Objetivo: {formatCentimos(cuenta.objetivoCentimos!)} (
                  {progreso.toFixed(0)}%)
                </p>
              </div>
            )}
          </div>

          <form onSubmit={handleAddMovimiento} className="flex flex-col gap-2 rounded-xl border border-paper-line p-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo("ingreso")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  tipo === "ingreso" ? "bg-accent text-accent-ink" : "bg-paper text-muted hover:bg-accent-soft"
                }`}
              >
                <TrendingUp aria-hidden size={14} /> Ingreso
              </button>
              <button
                type="button"
                onClick={() => setTipo("retirada")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  tipo === "retirada" ? "bg-danger text-white" : "bg-paper text-muted hover:bg-danger-soft"
                }`}
              >
                <TrendingDown aria-hidden size={14} /> Retirada
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="0,00 €"
                inputMode="decimal"
                aria-label="Importe"
                className="w-28"
              />
              <Input
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Concepto (opcional)"
                aria-label="Concepto"
                className="flex-1"
              />
              <Button type="submit" size="sm" disabled={pending}>
                Añadir
              </Button>
            </div>
          </form>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted uppercase">Historial</p>
            {historialError ? (
              <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
                <p>No se ha podido cargar el historial.</p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setHistorialAttempt((n) => n + 1)}
                  className="mt-2 focus-visible:ring-danger"
                >
                  Reintentar
                </Button>
              </div>
            ) : movimientos === null ? (
              <div className="skeleton h-16 rounded-lg" />
            ) : movimientos.length === 0 ? (
              <p className="text-sm text-muted">Sin movimientos todavía.</p>
            ) : (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{m.concepto || "Sin concepto"}</span>
                    <span className="shrink-0 text-xs text-muted">{formatDate(m.fecha)}</span>
                    <span className={`shrink-0 font-medium ${m.centimos >= 0 ? "text-accent-strong" : "text-danger"}`}>
                      {m.centimos >= 0 ? "+" : ""}
                      {formatCentimos(m.centimos)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="justify-start sm:justify-start">
            <Button type="button" variant="outline" onClick={handleDelete} disabled={pending} className="text-danger">
              <Trash2 aria-hidden size={15} /> {confirmingDelete ? "¿Seguro? Borrar" : "Borrar cuenta"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
