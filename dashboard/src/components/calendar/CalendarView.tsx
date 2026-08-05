"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Evento } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buildMonthGrid, dateKey, groupByDay } from "@/lib/calendar";
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

  const grid = buildMonthGrid(cursor.getUTCFullYear(), cursor.getUTCMonth());
  const byDay = groupByDay(eventos, (e) => e.fechaInicio);

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
                {dayEventos.slice(0, MAX_CHIPS_PER_DAY).map((evento) => (
                  <EventDetailDialog key={evento.id} evento={evento} onChanged={() => router.refresh()}>
                    <button
                      type="button"
                      className="truncate rounded bg-accent-soft px-1 py-0.5 text-left text-[11px] font-medium text-accent-strong transition-[filter] hover:brightness-95"
                    >
                      {evento.titulo}
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
