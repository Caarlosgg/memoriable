"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Evento } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck2 } from "lucide-react";
import { buildMonthGrid, buildWeekGrid, dateKey, groupByDayRange, type WeekDay } from "@/lib/calendar";
import { formatEventTime } from "@/lib/format";
import { avatarColorClass } from "@/lib/avatar";
import type { WorkspaceMemberInfo } from "@/app/(dashboard)/equipo/actions";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { EventDetailDialog } from "../EventDetailDialog";

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEK_RANGE_FORMATTER = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", timeZone: "UTC" });
const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_CHIPS_PER_DAY_MONTH = 3;
const MAX_CHIPS_PER_DAY_WEEK = 8;

type CalendarViewMode = "mes" | "semana";

/** Rango "12 - 18 ago" para el título de la vista semanal. */
function weekRangeLabel(days: WeekDay[]): string {
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  return `${first.getUTCDate()} - ${WEEK_RANGE_FORMATTER.format(last)}`;
}

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
  const [view, setView] = useState<CalendarViewMode>("mes");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  });
  function goToToday() {
    const now = new Date();
    setCursor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
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

  const monthGrid = buildMonthGrid(cursor.getUTCFullYear(), cursor.getUTCMonth());
  const weekGrid = buildWeekGrid(cursor);
  const grid = view === "mes" ? monthGrid : weekGrid;
  const maxChipsPerDay = view === "mes" ? MAX_CHIPS_PER_DAY_MONTH : MAX_CHIPS_PER_DAY_WEEK;
  // "Calendario por periodos": un evento con fechaFin en otro día aparece
  // en TODOS los días que ocupa, no solo el primero — antes solo se veía
  // el día de inicio, así que una actividad de varios días "desaparecía"
  // el resto del periodo.
  const byDay = groupByDayRange(
    eventos.filter((e) => !hiddenIds.has(e.id)),
    (e) => ({ from: e.fechaInicio, to: e.fechaFin ?? e.fechaInicio }),
  );

  function goToPrevious() {
    setCursor((prev) =>
      view === "mes"
        ? new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1))
        : new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate() - 7)),
    );
  }
  function goToNext() {
    setCursor((prev) =>
      view === "mes"
        ? new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1))
        : new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate() + 7)),
    );
  }

  const now = new Date();
  const isCurrentPeriod =
    view === "mes"
      ? cursor.getUTCFullYear() === now.getUTCFullYear() && cursor.getUTCMonth() === now.getUTCMonth()
      : weekGrid.some((d) => d.isToday);

  function memberOf(assigneeId: string | null): WorkspaceMemberInfo | undefined {
    return members.find((m) => m.userId === assigneeId);
  }

  /**
   * Color de la tarjeta de un evento: en modo equipo, un color determinista
   * por persona asignada (misma paleta que su avatar) para poder distinguir
   * de un vistazo de quién es cada evento en un calendario compartido — sin
   * asignar, o en modo personal (sin `members`), el acento por defecto de
   * toda la vida.
   */
  function chipColorClass(assignee: WorkspaceMemberInfo | undefined): string {
    if (!assignee) return "bg-accent-soft text-accent-strong";
    return avatarColorClass(assignee.email);
  }

  return (
    <section
      aria-labelledby="mes-heading"
      className="flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mes-heading" className="font-display text-lg font-semibold text-ink capitalize">
          {view === "mes" ? MONTH_FORMATTER.format(cursor) : weekRangeLabel(weekGrid)}
        </h2>
        <div className="flex items-center gap-1">
          <div className="mr-1 flex rounded-full border border-paper-line p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setView("mes")}
              aria-pressed={view === "mes"}
              className={`rounded-full px-2.5 py-1 transition-colors ${view === "mes" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              Mes
            </button>
            <button
              type="button"
              onClick={() => setView("semana")}
              aria-pressed={view === "semana"}
              className={`rounded-full px-2.5 py-1 transition-colors ${view === "semana" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              Semana
            </button>
          </div>
          <button
            type="button"
            onClick={goToPrevious}
            aria-label={view === "mes" ? "Mes anterior" : "Semana anterior"}
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft aria-hidden size={18} />
          </button>
          <button
            type="button"
            onClick={goToNext}
            aria-label={view === "mes" ? "Mes siguiente" : "Semana siguiente"}
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight aria-hidden size={18} />
          </button>
          {!isCurrentPeriod && (
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
          const inMonth = "inMonth" in day ? day.inMonth : true;
          return (
            <div
              key={key}
              className={`flex ${view === "mes" ? "min-h-[80px]" : "min-h-[220px]"} flex-col gap-1 rounded-lg border p-1.5 text-xs ${
                inMonth ? "border-paper-line bg-paper" : "border-transparent bg-paper/40"
              } ${day.isToday ? "border-accent ring-1 ring-accent" : ""}`}
            >
              <span
                className={`font-medium ${
                  day.isToday ? "text-accent-strong" : inMonth ? "text-ink" : "text-muted"
                }`}
              >
                {day.date.getUTCDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayEventos.slice(0, maxChipsPerDay).map((evento) => {
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
                        className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium transition-[filter] hover:brightness-95 ${chipColorClass(assignee)}`}
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
                {dayEventos.length > maxChipsPerDay && (
                  <span className="text-[11px] text-muted">+{dayEventos.length - maxChipsPerDay} más</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
