"use client";

import { CalendarClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { dateKey, dayLabel, isOverdue } from "@/lib/calendar";

/** Medianoche UTC de hoy + `days` días — mismo criterio "solo importa el día" que el resto del calendario. */
function addDays(days: number): Date {
  const d = new Date();
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

/**
 * Acción rápida "Aplazar" de una tarjeta accionable (tarea/recordatorio):
 * mañana / próxima semana / fecha concreta, sin abrir el modal de edición
 * completo — mismo espíritu que `AssigneeControl` (protagonismo + rapidez
 * para la acción que de verdad se usa a diario). `stopPropagation` por el
 * mismo motivo que allí: vive dentro de una tarjeta que abre un modal al
 * hacer clic, y el contenido del dropdown se monta en un Portal.
 */
export function PostponeControl({
  fechaLimite,
  onChange,
}: {
  fechaLimite: Date | null;
  onChange: (fechaLimite: Date | null) => void;
}) {
  const overdue = fechaLimite ? isOverdue(fechaLimite) : false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          title={fechaLimite ? "Cambiar la fecha límite" : "Aplazar"}
          aria-label={
            fechaLimite
              ? `${overdue ? "Vencida, aplazada" : "Aplazada"} a ${dayLabel(dateKey(fechaLimite))}. Cambiar.`
              : "Aplazar esta tarjeta"
          }
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            overdue
              ? "border-danger/40 bg-danger/10 text-danger hover:brightness-95"
              : fechaLimite
                ? "border-paper-line bg-paper text-ink hover:border-accent hover:bg-accent-soft hover:text-accent-strong"
                : "border-dashed border-paper-line text-muted hover:border-accent hover:text-accent-strong"
          }`}
        >
          <CalendarClock aria-hidden size={11} />
          {fechaLimite ? dayLabel(dateKey(fechaLimite)) : "Aplazar"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Aplazar a</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange(addDays(1))}>Mañana</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange(addDays(7))}>La semana que viene</DropdownMenuItem>
        <DropdownMenuSeparator />
        <label className="flex items-center gap-2 px-2 py-1.5 text-sm text-ink">
          Elegir fecha
          <input
            type="date"
            defaultValue={fechaLimite ? dateKey(fechaLimite) : ""}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value) onChange(new Date(`${e.target.value}T00:00:00.000Z`));
            }}
            className="ml-auto rounded border border-paper-line bg-paper px-1.5 py-0.5 text-xs text-ink outline-none focus-visible:border-accent"
          />
        </label>
        {fechaLimite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)}>Quitar fecha</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
