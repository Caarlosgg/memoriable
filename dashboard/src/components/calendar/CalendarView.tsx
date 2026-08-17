"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Evento, Message } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck2, ListTodo } from "lucide-react";
import { buildMonthGrid, buildWeekGrid, dateKey, groupByDayRange, layoutDayEvents, type WeekDay } from "@/lib/calendar";
import { formatEventTime } from "@/lib/format";
import { avatarColorClass } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { EventDetailDialog } from "../EventDetailDialog";
import { MessageDetailDialog } from "../MessageDetailDialog";

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEK_RANGE_FORMATTER = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", timeZone: "UTC" });
const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_CHIPS_PER_DAY_MONTH = 3;

/** Vista semana: rejilla horaria real (estilo Google Calendar/Outlook) en vez de chips apilados — ver `layoutDayEvents`. */
const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEK_GRID_COLUMNS = "40px repeat(7, minmax(90px, 1fr))";
/** Cada cuánto se recalcula la línea de "ahora" en la columna de hoy — no hace falta más fino que esto. */
const NOW_LINE_REFRESH_MS = 5 * 60 * 1000;

/** Un evento es "de todo el día" (o de varios días) cuando su fin cae en otra fecha — no tiene sentido posicionarlo por hora. */
function isAllDay(evento: Evento): boolean {
  return !!evento.fechaFin && dateKey(evento.fechaFin) !== dateKey(evento.fechaInicio);
}

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
  tareas = [],
  members = [],
  highlightEventoId,
}: {
  eventos: Evento[];
  /** Tareas/recordatorios con fecha límite (ver getTasksWithDeadline) — se pintan junto a los eventos, con otro aspecto. */
  tareas?: Message[];
  /** Miembros del workspace activo, para mostrar quién tiene asignado cada evento — vacío en modo personal. */
  members?: WorkspaceMemberInfo[];
  /** Evento al que ha navegado la notificación de asignación (?evento=ID) — abre su detalle solo, sin tocar el resto. */
  highlightEventoId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<CalendarViewMode>("mes");
  const [cursor, setCursor] = useState(() => {
    // Si venimos de la notificación de un evento, arrancar en el mes en el
    // que cae ese evento — si no, nunca se vería su chip para poder abrirlo.
    const highlighted = highlightEventoId ? eventos.find((e) => e.id === highlightEventoId) : undefined;
    if (highlighted) {
      const d = highlighted.fechaInicio;
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
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

  // Línea de "ahora" en la vista semana (columna de hoy) — se recalcula cada
  // pocos minutos, no hace falta al segundo para que siga siendo útil.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), NOW_LINE_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Al entrar en vista semana (o cambiar de semana), la rejilla arranca
  // centrada sobre la hora actual en vez de en 00:00 — nadie quiere hacer
  // scroll manual para ver "qué tengo ahora".
  const hourGridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view !== "semana" || !hourGridRef.current) return;
    const nowMinutes = nowTick.getUTCHours() * 60 + nowTick.getUTCMinutes();
    hourGridRef.current.scrollTop = Math.max(0, (nowMinutes / 60) * HOUR_HEIGHT - HOUR_HEIGHT * 2);
    // Solo al cambiar de vista/semana — no en cada tick de nowTick, o se
    // pelearía con el scroll manual del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

  const monthGrid = buildMonthGrid(cursor.getUTCFullYear(), cursor.getUTCMonth());
  const weekGrid = buildWeekGrid(cursor);
  // "Calendario por periodos": un evento con fechaFin en otro día aparece
  // en TODOS los días que ocupa, no solo el primero — antes solo se veía
  // el día de inicio, así que una actividad de varios días "desaparecía"
  // el resto del periodo.
  const byDay = groupByDayRange(
    eventos.filter((e) => !hiddenIds.has(e.id)),
    (e) => ({ from: e.fechaInicio, to: e.fechaFin ?? e.fechaInicio }),
  );

  // Tareas con fecha límite, agrupadas por su día de vencimiento. A
  // diferencia de los eventos NO ocupan un rango: una entrega es un punto
  // en el tiempo, así que va solo en su día (por eso no usa groupByDayRange).
  const tareasByDay = new Map<string, Message[]>();
  for (const tarea of tareas) {
    if (!tarea.fechaLimite || hiddenIds.has(tarea.id)) continue;
    const key = dateKey(tarea.fechaLimite);
    const list = tareasByDay.get(key);
    if (list) list.push(tarea);
    else tareasByDay.set(key, [tarea]);
  }

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

  /**
   * Las tareas se distinguen de los eventos a simple vista: contorno
   * punteado en vez de fondo sólido. Un evento es una cita a una hora; una
   * tarea es algo que vence ese día — mezclarlas con el mismo aspecto haría
   * el calendario más confuso, no más útil. Una tarea ya vencida se pinta
   * en rojo: es justo lo que hay que ver primero al abrir el mes.
   */
  function tareaChipClass(vencida: boolean): string {
    return vencida
      ? "border border-dashed border-danger/60 bg-danger-soft text-danger"
      : "border border-dashed border-accent/50 bg-paper text-ink";
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

      {view === "mes" ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((day, i) => {
              const key = dateKey(day.date);
              const dayEventos = byDay.get(key) ?? [];
              const dayTareas = tareasByDay.get(key) ?? [];
              const inMonth = day.inMonth;
              const isWeekend = i % 7 >= 5;
              const hasEventos = dayEventos.length > 0 || dayTareas.length > 0;
              // El reparto de sitio da preferencia a los eventos (tienen
              // hora concreta); las tareas ocupan lo que sobra, y el resto
              // se resume en "+N más" al final, como ya se hacía.
              const huecoParaTareas = Math.max(0, MAX_CHIPS_PER_DAY_MONTH - dayEventos.length);
              const tareasVisibles = dayTareas.slice(0, huecoParaTareas);
              const ocultas =
                Math.max(0, dayEventos.length - MAX_CHIPS_PER_DAY_MONTH) + (dayTareas.length - tareasVisibles.length);
              return (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-[80px] flex-col gap-1 rounded-lg border p-1.5 text-xs transition-colors",
                    inMonth ? (isWeekend ? "border-paper-line bg-paper-line/20" : "border-paper-line bg-paper") : "border-transparent bg-paper/40",
                    hasEventos && inMonth && !day.isToday && "border-accent/30",
                    day.isToday && "border-accent bg-accent-soft/50 ring-1 ring-accent",
                  )}
                >
                  <span
                    className={`flex items-center gap-1 font-medium ${
                      day.isToday ? "text-accent-strong" : inMonth ? "text-ink" : "text-muted"
                    }`}
                  >
                    {day.date.getUTCDate()}
                    {hasEventos && !day.isToday && (
                      <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
                    )}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {dayEventos.slice(0, MAX_CHIPS_PER_DAY_MONTH).map((evento) => {
                      const assignee = memberOf(evento.assigneeId);
                      return (
                        <EventDetailDialog
                          key={evento.id}
                          evento={evento}
                          members={members}
                          onChanged={() => router.refresh()}
                          onDeleted={handleDeleted}
                          onUndoDelete={handleUndoDelete}
                          defaultOpen={evento.id === highlightEventoId}
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
                    {tareasVisibles.map((tarea) => {
                      const assignee = memberOf(tarea.assigneeId);
                      const vencida = tarea.fechaLimite != null && tarea.fechaLimite < now;
                      return (
                        <MessageDetailDialog key={tarea.id} message={tarea} members={members} onDeleted={handleDeleted} onUndoDelete={handleUndoDelete}>
                          <button
                            type="button"
                            title={`Tarea${vencida ? " vencida" : ""}: ${tarea.resumen}`}
                            className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium transition-[filter] hover:brightness-95 ${tareaChipClass(vencida)}`}
                          >
                            <ListTodo aria-hidden size={10} className="shrink-0" />
                            {assignee && <Avatar email={assignee.email} size="xs" className="shrink-0" />}
                            <span className="truncate">{tarea.resumen}</span>
                          </button>
                        </MessageDetailDialog>
                      );
                    })}
                    {ocultas > 0 && <span className="text-[11px] text-muted">+{ocultas} más</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 40 + 7 * 90 }}>
            <div className="grid gap-px pb-1" style={{ gridTemplateColumns: WEEK_GRID_COLUMNS }}>
              <div />
              {weekGrid.map((day, i) => (
                <div key={dateKey(day.date)} className="text-center text-xs font-semibold text-muted">
                  {WEEKDAY_LABELS[i]}{" "}
                  <span
                    className={
                      day.isToday
                        ? "inline-block rounded-full bg-accent px-1.5 py-0.5 text-accent-ink"
                        : "text-ink"
                    }
                  >
                    {day.date.getUTCDate()}
                  </span>
                </div>
              ))}
            </div>

            {/* Franja superior: eventos de todo el día Y tareas que vencen
                ese día. Una fecha límite no tiene hora real, así que
                colocarla en la rejilla horaria sería inventarse un dato —
                aquí arriba es donde de verdad corresponde. */}
            {weekGrid.some(
              (day) =>
                (byDay.get(dateKey(day.date)) ?? []).some(isAllDay) ||
                (tareasByDay.get(dateKey(day.date)) ?? []).length > 0,
            ) && (
              <div
                className="grid gap-px border-b border-paper-line pb-1"
                style={{ gridTemplateColumns: WEEK_GRID_COLUMNS }}
              >
                <span className="pt-0.5 text-[9px] text-muted">todo el día</span>
                {weekGrid.map((day) => {
                  const key = dateKey(day.date);
                  const allDayEventos = (byDay.get(key) ?? []).filter(isAllDay);
                  const dayTareas = tareasByDay.get(key) ?? [];
                  return (
                    <div key={key} className="flex flex-col gap-0.5 px-0.5">
                      {dayTareas.map((tarea) => {
                        const assignee = memberOf(tarea.assigneeId);
                        const vencida = tarea.fechaLimite != null && tarea.fechaLimite < now;
                        return (
                          <MessageDetailDialog
                            key={tarea.id}
                            message={tarea}
                            members={members}
                            onDeleted={handleDeleted}
                            onUndoDelete={handleUndoDelete}
                          >
                            <button
                              type="button"
                              title={`Tarea${vencida ? " vencida" : ""}: ${tarea.resumen}`}
                              className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium transition-[filter] hover:brightness-95 ${tareaChipClass(vencida)}`}
                            >
                              <ListTodo aria-hidden size={9} className="shrink-0" />
                              {assignee && <Avatar email={assignee.email} size="xs" className="shrink-0" />}
                              <span className="truncate">{tarea.resumen}</span>
                            </button>
                          </MessageDetailDialog>
                        );
                      })}
                      {allDayEventos.map((evento) => {
                        const assignee = memberOf(evento.assigneeId);
                        return (
                          <EventDetailDialog
                            key={evento.id}
                            evento={evento}
                            members={members}
                            onChanged={() => router.refresh()}
                            onDeleted={handleDeleted}
                            onUndoDelete={handleUndoDelete}
                            defaultOpen={evento.id === highlightEventoId}
                          >
                            <button
                              type="button"
                              className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium transition-[filter] hover:brightness-95 ${chipColorClass(assignee)}`}
                            >
                              {evento.titulo}
                            </button>
                          </EventDetailDialog>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={hourGridRef} className="overflow-y-auto" style={{ maxHeight: 480 }}>
              <div className="grid" style={{ gridTemplateColumns: WEEK_GRID_COLUMNS }}>
                <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
                  {HOURS.map((h) => (
                    <span
                      key={h}
                      className="absolute right-1 -translate-y-1/2 text-[10px] text-muted"
                      style={{ top: h * HOUR_HEIGHT }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                {weekGrid.map((day) => {
                  const key = dateKey(day.date);
                  const timedEventos = (byDay.get(key) ?? []).filter((e) => !isAllDay(e));
                  const laidOut = layoutDayEvents(timedEventos, (e) => ({ start: e.fechaInicio, end: e.fechaFin }));
                  const nowMinutes = day.isToday ? nowTick.getUTCHours() * 60 + nowTick.getUTCMinutes() : null;
                  return (
                    <div
                      key={key}
                      className={`relative border-l border-paper-line ${day.isToday ? "bg-accent-soft/20" : ""}`}
                      style={{ height: HOUR_HEIGHT * 24 }}
                    >
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          className="absolute inset-x-0 border-t border-paper-line/60"
                          style={{ top: h * HOUR_HEIGHT }}
                        />
                      ))}
                      {nowMinutes !== null && (
                        <div
                          className="absolute inset-x-0 z-10 border-t-2 border-accent"
                          style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                        >
                          <span className="absolute -left-1 -top-1 block h-2 w-2 rounded-full bg-accent" />
                        </div>
                      )}
                      {laidOut.map(({ item: evento, topMinutes, durationMinutes, lane, lanesInDay }) => {
                        const assignee = memberOf(evento.assigneeId);
                        const widthPct = 100 / lanesInDay;
                        return (
                          <EventDetailDialog
                            key={evento.id}
                            evento={evento}
                            members={members}
                            onChanged={() => router.refresh()}
                            onDeleted={handleDeleted}
                            onUndoDelete={handleUndoDelete}
                            defaultOpen={evento.id === highlightEventoId}
                          >
                            <button
                              type="button"
                              className={`absolute overflow-hidden rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition-[filter] hover:z-20 hover:brightness-95 ${chipColorClass(assignee)}`}
                              style={{
                                top: (topMinutes / 60) * HOUR_HEIGHT,
                                height: (durationMinutes / 60) * HOUR_HEIGHT,
                                left: `${lane * widthPct}%`,
                                width: `calc(${widthPct}% - 2px)`,
                              }}
                            >
                              {formatEventTime(evento.fechaInicio) && (
                                <span className="block opacity-80">{formatEventTime(evento.fechaInicio)}</span>
                              )}
                              <span className="flex items-center gap-1 truncate">
                                {assignee && <Avatar email={assignee.email} size="xs" className="shrink-0" />}
                                <span className="truncate">{evento.titulo}</span>
                              </span>
                            </button>
                          </EventDetailDialog>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
