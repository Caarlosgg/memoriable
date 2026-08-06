"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Evento } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { buildMonthGrid, dateKey, groupByDayRange, expandRecurrence } from "@/lib/calendar";
import { Button } from "../ui/button";
import { EventDetailDialog } from "../EventDetailDialog";

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_CHIPS_PER_DAY = 3;

/**
 * Vista mensual propia (grid CSS de 7 columnas), sin librería de calendario
 * de terceros — coherente con el resto del dashboard. Sin fetch por mes: se
 * le pasan TODOS los eventos del usuario de una vez (uso personal, volumen
 * bajo, ver comentario en calendario/page.tsx) y navega entre meses en
 * memoria, sin ida y vuelta al servidor.
 */
export function CalendarView({ eventos }: { eventos: Evento[] }) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  // Borrado con margen de deshacer (Tier 1.3), mismo patrón que KanbanBoard.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  function handleDeleted(id: string) {
    setHiddenIds((prev) => new Set(prev).add(id));
  }
  function handleUndoDelete(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const grid = buildMonthGrid(cursor.getUTCFullYear(), cursor.getUTCMonth());
  const rangeStart = grid[0]!.date;
  const rangeEnd = new Date(grid[41]!.date);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); // exclusivo: cubre también el último día de la cuadrícula

  // Cada evento se "expande" a sus ocurrencias reales dentro de la
  // cuadrícula visible (una sola si no repite, ver expandRecurrence) y
  // cada ocurrencia conserva la duración original (fechaFin - fechaInicio)
  // — así un evento recurrente que además dura varios días sigue
  // "rellenando" cada uno de esos días en cada repetición.
  const occurrences = eventos
    .filter((e) => !hiddenIds.has(e.id))
    .flatMap((evento) => {
      const duracionMs = evento.fechaFin ? evento.fechaFin.getTime() - evento.fechaInicio.getTime() : 0;
      return expandRecurrence(evento, rangeStart, rangeEnd).map((inicio) => ({
        evento,
        from: inicio,
        to: duracionMs > 0 ? new Date(inicio.getTime() + duracionMs) : inicio,
      }));
    });
  // "Calendario por periodos": un evento con fechaFin en otro día aparece
  // en TODOS los días que ocupa, no solo el primero — antes solo se veía
  // el día de inicio, así que una actividad de varios días "desaparecía"
  // el resto del periodo.
  const byDay = groupByDayRange(occurrences, (o) => ({ from: o.from, to: o.to }));

  function goToMonth(delta: number) {
    setCursor((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + delta, 1)));
  }

  return (
    <section
      aria-labelledby="mes-heading"
      className="flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mes-heading" className="font-display text-lg font-semibold text-ink capitalize">
          {MONTH_FORMATTER.format(cursor)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Mes anterior"
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft aria-hidden size={18} />
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="Mes siguiente"
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight aria-hidden size={18} />
          </button>
          <EventDetailDialog onChanged={() => router.refresh()}>
            <Button type="button" size="sm" className="ml-2">
              <Plus aria-hidden size={14} /> Nuevo
            </Button>
          </EventDetailDialog>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((day) => {
          const key = dateKey(day.date);
          const dayEventos = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`flex min-h-[80px] flex-col gap-1 rounded-lg border p-1.5 text-xs ${
                day.inMonth ? "border-paper-line bg-paper" : "border-transparent bg-paper/40"
              } ${day.isToday ? "border-accent ring-1 ring-accent" : ""}`}
            >
              <span
                className={`font-medium ${
                  day.isToday ? "text-accent-strong" : day.inMonth ? "text-ink" : "text-muted"
                }`}
              >
                {day.date.getUTCDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayEventos.slice(0, MAX_CHIPS_PER_DAY).map((occurrence) => (
                  <EventDetailDialog
                    key={`${occurrence.evento.id}-${dateKey(occurrence.from)}`}
                    evento={occurrence.evento}
                    onChanged={() => router.refresh()}
                    onDeleted={handleDeleted}
                    onUndoDelete={handleUndoDelete}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 truncate rounded bg-accent-soft px-1 py-0.5 text-left text-[11px] font-medium text-accent-strong transition-[filter] hover:brightness-95"
                    >
                      {occurrence.evento.recurrencia && <Repeat aria-hidden size={10} className="shrink-0" />}
                      <span className="truncate">{occurrence.evento.titulo}</span>
                    </button>
                  </EventDetailDialog>
                ))}
                {dayEventos.length > MAX_CHIPS_PER_DAY && (
                  <span className="text-[11px] text-muted">+{dayEventos.length - MAX_CHIPS_PER_DAY} más</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
