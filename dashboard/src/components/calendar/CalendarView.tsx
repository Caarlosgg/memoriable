"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Evento } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck2 } from "lucide-react";
import { buildMonthGrid, dateKey, groupByDayRange } from "@/lib/calendar";
import { formatEventTime } from "@/lib/format";
import type { WorkspaceMemberInfo } from "@/app/(dashboard)/equipo/actions";
import { Avatar } from "../ui/avatar";
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
export function CalendarView({
  eventos,
  members = [],
}: {
  eventos: Evento[];
  /** Miembros del workspace activo, para mostrar quién tiene asignado cada evento — vacío en modo personal. */
  members?: WorkspaceMemberInfo[];
}) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  function goToToday() {
    const now = new Date();
    setCursor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  }
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
  // "Calendario por periodos": un evento con fechaFin en otro día aparece
  // en TODOS los días que ocupa, no solo el primero — antes solo se veía
  // el día de inicio, así que una actividad de varios días "desaparecía"
  // el resto del periodo.
  const byDay = groupByDayRange(
    eventos.filter((e) => !hiddenIds.has(e.id)),
    (e) => ({ from: e.fechaInicio, to: e.fechaFin ?? e.fechaInicio }),
  );

  function goToMonth(delta: number) {
    setCursor((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + delta, 1)));
  }

  const now = new Date();
  const isCurrentMonth = cursor.getUTCFullYear() === now.getUTCFullYear() && cursor.getUTCMonth() === now.getUTCMonth();

  function memberOf(assigneeId: string | null): WorkspaceMemberInfo | undefined {
    return members.find((m) => m.userId === assigneeId);
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
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToToday}
              className="flex items-center gap-1 rounded-full border border-paper-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <CalendarCheck2 aria-hidden size={13} /> Hoy
            </button>
          )}
          <EventDetailDialog members={members} onChanged={() => router.refresh()}>
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
                {dayEventos.slice(0, MAX_CHIPS_PER_DAY).map((evento) => {
                  const assignee = memberOf(evento.assigneeId);
                  return (
                    <EventDetailDialog
                      key={evento.id}
                      evento={evento}
                      members={members}
                      onChanged={() => router.refresh()}
                      onDeleted={handleDeleted}
                      onUndoDelete={handleUndoDelete}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-1 truncate rounded bg-accent-soft px-1 py-0.5 text-left text-[11px] font-medium text-accent-strong transition-[filter] hover:brightness-95"
                      >
                        {assignee && <Avatar email={assignee.email} size="xs" className="shrink-0" />}
                        <span className="truncate">
                          {formatEventTime(evento.fechaInicio) && (
                            <span className="font-normal opacity-80">{formatEventTime(evento.fechaInicio)} </span>
                          )}
                          {evento.titulo}
                        </span>
                      </button>
                    </EventDetailDialog>
                  );
                })}
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
