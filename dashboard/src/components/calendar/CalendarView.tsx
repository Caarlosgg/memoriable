"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Evento, Message } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck2, ListTodo, Download } from "lucide-react";
import { buildMonthGrid, buildWeekGrid, dateKey, groupByDayRange, layoutDayEvents, rangoCalendario, type WeekDay } from "@/lib/calendar";
import { loadCalendarRange } from "@/app/(dashboard)/calendario/actions";
import { assignMessage } from "@/app/(dashboard)/actions";
import type { EditableFields } from "../MessageDetailDialog";
import { formatEventTime } from "@/lib/format";
import { avatarColorClass } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { EventDetailDialog } from "../EventDetailDialog";
import { MessageDetailDialog } from "../MessageDetailDialog";
import { DayDetailDialog } from "./DayDetailDialog";

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const WEEK_RANGE_FORMATTER = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", timeZone: "UTC" });
const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_CHIPS_PER_DAY_MONTH = 3;

/** Vista semana: rejilla horaria real (estilo Google Calendar/Outlook) en vez de chips apilados — ver `layoutDayEvents`. */
const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
/**
 * Columnas de la rejilla de horas: la de las horas (40px) más una por día.
 * Se calcula a partir de cuántos días se pintan para que la vista "día"
 * ocupe todo el ancho en vez de dejar una columna estrecha y seis huecos.
 */
function gridColumns(dias: number): string {
  return `40px repeat(${dias}, minmax(90px, 1fr))`;
}
/** Cada cuánto se recalcula la línea de "ahora" en la columna de hoy — no hace falta más fino que esto. */
const NOW_LINE_REFRESH_MS = 5 * 60 * 1000;

/** Un evento es "de todo el día" (o de varios días) cuando su fin cae en otra fecha — no tiene sentido posicionarlo por hora. */
function isAllDay(evento: Evento): boolean {
  return !!evento.fechaFin && dateKey(evento.fechaFin) !== dateKey(evento.fechaInicio);
}

type CalendarViewMode = "mes" | "semana" | "dia";

/** Rango "12 - 18 ago" para el título de la vista semanal. */
function weekRangeLabel(days: WeekDay[]): string {
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  return `${first.getUTCDate()} - ${WEEK_RANGE_FORMATTER.format(last)}`;
}

/**
 * Vista mensual propia (grid CSS de 7 columnas), sin librería de calendario
 * de terceros — coherente con el resto del dashboard. La página trae solo
 * los meses de alrededor (ver rangoCalendario en lib/eventos.ts) y, al
 * navegar fuera de eso, esta vista pide el tramo que falte y lo fusiona:
 * traerse el historial entero en cada carga no escala con el uso.
 */
export function CalendarView({
  eventos: eventosProp,
  tareas: tareasProp = [],
  members = [],
  highlightEventoId,
}: {
  eventos: Evento[];
  /** Tareas/recordatorios con fecha límite (ver getTasksEnRango en lib/eventos.ts) — se pintan junto a los eventos, con otro aspecto. */
  tareas?: Message[];
  /** Miembros del workspace activo, para mostrar quién tiene asignado cada evento — vacío en modo personal. */
  members?: WorkspaceMemberInfo[];
  /** Evento al que ha navegado la notificación de asignación (?evento=ID) — abre su detalle solo, sin tocar el resto. */
  highlightEventoId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<CalendarViewMode>("mes");

  /**
   * Cuántas veces se ha pedido abrir "Nuevo evento" desde fuera (la paleta
   * de comandos navega a `/calendario#nuevo-evento`). Es un contador y no
   * un booleano para que pedirlo DOS veces seguidas vuelva a abrir el
   * modal: con un booleano, cerrarlo y repetir el comando no haría nada.
   */
  const [aperturasPedidas, setAperturasPedidas] = useState(0);
  useEffect(() => {
    const abrirSiToca = () => {
      if (window.location.hash !== "#nuevo-evento") return;
      setAperturasPedidas((n) => n + 1);
      // Se limpia el hash: si no, recargar la página volvería a abrir el
      // modal, y volver atrás en el historial también.
      history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    abrirSiToca();
    window.addEventListener("hashchange", abrirSiToca);
    return () => window.removeEventListener("hashchange", abrirSiToca);
  }, []);
  const [cursor, setCursor] = useState(() => {
    // Si venimos de la notificación de un evento, arrancar en el mes en el
    // que cae ese evento — si no, nunca se vería su chip para poder abrirlo.
    const highlighted = highlightEventoId ? eventosProp.find((e) => e.id === highlightEventoId) : undefined;
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
    if (view === "mes" || !hourGridRef.current) return;
    const nowMinutes = nowTick.getUTCHours() * 60 + nowTick.getUTCMinutes();
    hourGridRef.current.scrollTop = Math.max(0, (nowMinutes / 60) * HOUR_HEIGHT - HOUR_HEIGHT * 2);
    // Solo al cambiar de vista/semana — no en cada tick de nowTick, o se
    // pelearía con el scroll manual del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

  // La página trae solo los meses de alrededor (ver rangoCalendario). Al
  // navegar fuera de lo ya cargado se pide ese tramo y se fusiona por id
  // — sin esto, moverse a un mes lejano lo mostraba vacío aunque tuviera
  // cosas. Se recuerdan los tramos ya pedidos para no repetirlos al ir y
  // volver entre los mismos meses.
  const [eventosExtra, setEventosExtra] = useState<Evento[]>([]);
  const [tareasExtra, setTareasExtra] = useState<Message[]>([]);
  const tramosPedidos = useRef(new Set<string>());
  const [cargandoTramo, setCargandoTramo] = useState(false);

  useEffect(() => {
    const { desde, hasta } = rangoCalendario(cursor, 1);
    const clave = `${desde.toISOString()}|${hasta.toISOString()}`;
    if (tramosPedidos.current.has(clave)) return;
    tramosPedidos.current.add(clave);

    let cancelado = false;
    setCargandoTramo(true);
    loadCalendarRange(desde.toISOString(), hasta.toISOString())
      .then(({ eventos: nuevos, tareas: nuevasTareas }) => {
        if (cancelado) return;
        setEventosExtra((prev) => {
          const conocidos = new Set(prev.map((e) => e.id));
          return [...prev, ...nuevos.filter((e) => !conocidos.has(e.id))];
        });
        setTareasExtra((prev) => {
          const conocidas = new Set(prev.map((t) => t.id));
          return [...prev, ...nuevasTareas.filter((t) => !conocidas.has(t.id))];
        });
      })
      .catch((err) => console.error("No se pudo cargar ese tramo del calendario:", err))
      .finally(() => {
        if (!cancelado) setCargandoTramo(false);
      });

    return () => {
      cancelado = true;
    };
  }, [cursor]);

  // Lo que trajo la página + lo cargado después, sin duplicar: los `extra`
  // pueden solapar con los iniciales si el tramo pedido los incluye.
  const idsIniciales = new Set(eventosProp.map((e) => e.id));
  const eventos = [...eventosProp, ...eventosExtra.filter((e) => !idsIniciales.has(e.id))];
  const idsTareasIniciales = new Set(tareasProp.map((t) => t.id));
  const tareasSinPatch = [...tareasProp, ...tareasExtra.filter((t) => !idsTareasIniciales.has(t.id))];

  /**
   * Asignar o editar una tarea desde el calendario (asignar/editar). Antes
   * el diálogo de la tarea no recibía `onAssigneeChange` ni `onSaved`, así
   * que el control "Asignar a…" ni se pintaba y una edición no se veía
   * hasta recargar. Parche local por id, igual que el resto de la app
   * (ver `applyLocalUpdate` en KanbanBoard.tsx) — nunca se reescribe la
   * lista entera para no perder lo que ya se había fusionado con
   * `loadCalendarRange`.
   */
  const [tareaPatches, setTareaPatches] = useState<Record<string, Partial<Message>>>({});
  const tareas = tareasSinPatch.map((t) => (tareaPatches[t.id] ? { ...t, ...tareaPatches[t.id] } : t));

  function handleTareaAssigneeChange(messageId: string, assigneeId: string | null) {
    setTareaPatches((prev) => ({ ...prev, [messageId]: { ...prev[messageId], assigneeId } }));
    assignMessage(messageId, assigneeId).then((result) => {
      if (result.error) {
        console.error("No se pudo asignar la tarea:", result.error);
        setTareaPatches((prev) => {
          const { [messageId]: _quitado, ...resto } = prev;
          return resto;
        });
      }
    });
  }

  function handleTareaSaved(messageId: string, patch: EditableFields) {
    setTareaPatches((prev) => ({ ...prev, [messageId]: { ...prev[messageId], ...patch } }));
  }

  const monthGrid = buildMonthGrid(cursor.getUTCFullYear(), cursor.getUTCMonth());
  /**
   * Los días que se pintan en la rejilla de horas.
   *
   * La vista "día" es la de semana con UNA columna: la rejilla de horas, el
   * posicionamiento de los eventos y la línea de "ahora" ya funcionaban, y
   * duplicarlos para pintar un solo día habría creado dos sitios donde
   * arreglar el mismo fallo. En el móvil es la única vista de horas
   * legible — siete columnas en 360px no caben.
   */
  const weekGrid = view === "dia" ? buildWeekGrid(cursor).filter((d) => dateKey(d.date) === dateKey(cursor)) : buildWeekGrid(cursor);
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

  /** Cuántos días salta la navegación: un mes, una semana o un día. */
  function avanzar(prev: Date, signo: 1 | -1): Date {
    if (view === "mes") {
      return new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + signo, 1));
    }
    const dias = view === "dia" ? 1 : 7;
    return new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate() + signo * dias));
  }
  function goToPrevious() {
    setCursor((prev) => avanzar(prev, -1));
  }
  function goToNext() {
    setCursor((prev) => avanzar(prev, 1));
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
        <h2 id="mes-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-ink capitalize">
          {view === "mes"
            ? MONTH_FORMATTER.format(cursor)
            : view === "dia"
              ? DAY_FORMATTER.format(cursor)
              : weekRangeLabel(weekGrid)}
          {/* Señal de que ese tramo aún se está trayendo: sin esto, un mes
              lejano parece vacío durante un instante y da la impresión de
              que no hay nada, en vez de que falta por cargar. */}
          {cargandoTramo && (
            <span role="status" className="text-xs font-normal text-muted">
              cargando…
            </span>
          )}
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
            {/* Vista día: en el móvil es la única rejilla de horas legible
                — siete columnas en 360px se quedan en puntos sin texto. */}
            <button
              type="button"
              onClick={() => setView("dia")}
              aria-pressed={view === "dia"}
              className={`rounded-full px-2.5 py-1 transition-colors ${view === "dia" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              Día
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
          {/* Exportar a .ics: sin esto, lo que capturas por Telegram vive
              solo aquí dentro, y nadie mantiene dos calendarios. */}
          <a
            href="/api/calendario/ics"
            download="memoriable.ics"
            title="Descargar el calendario (.ics) para Google Calendar, Apple o Outlook"
            className="flex items-center gap-1 rounded-full border border-paper-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Download aria-hidden size={13} /> Exportar
          </a>
          {/* `key` + `defaultOpen`: `defaultOpen` solo se lee en el primer
              render, así que llegar con `#nuevo-evento` estando YA en el
              calendario no abriría nada. Cambiar la clave remonta el modal
              ya abierto, que es lo que se pide. */}
          <EventDetailDialog
            key={`nuevo-${aperturasPedidas}`}
            members={members}
            defaultOpen={aperturasPedidas > 0}
            onChanged={() => router.refresh()}
          >
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
                  {/* MÓVIL: la casilla entera se toca y abre la ficha del
                      día. A ~50px de ancho, un chip de texto queda recortado
                      a dos letras — mejor puntos, que sí se leen de un
                      vistazo, y el detalle completo al tocar. */}
                  <DayDetailDialog
                    date={day.date}
                    eventos={dayEventos}
                    tareas={dayTareas}
                    members={members}
                    ahora={now}
                    onChanged={() => router.refresh()}
                    onTareaAssigneeChange={handleTareaAssigneeChange}
                    onTareaSaved={handleTareaSaved}
                    onDeleted={handleDeleted}
                    onUndoDelete={handleUndoDelete}
                  >
                    <button
                      type="button"
                      aria-label={`Ver el día ${day.date.getUTCDate()}${hasEventos ? ` (${dayEventos.length + dayTareas.length})` : ""}`}
                      className="flex flex-1 flex-col items-start gap-1 rounded text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:hidden"
                    >
                      <span
                        className={`font-medium ${day.isToday ? "text-accent-strong" : inMonth ? "text-ink" : "text-muted"}`}
                      >
                        {day.date.getUTCDate()}
                      </span>
                      <span aria-hidden className="flex flex-wrap gap-0.5">
                        {dayEventos.slice(0, 4).map((e) => (
                          <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-accent" />
                        ))}
                        {dayTareas.slice(0, 4).map((t) => (
                          <span
                            key={t.id}
                            className={`h-1.5 w-1.5 rounded-full border ${
                              t.fechaLimite != null && t.fechaLimite < now ? "border-danger bg-danger" : "border-accent bg-paper"
                            }`}
                          />
                        ))}
                      </span>
                    </button>
                  </DayDetailDialog>

                  <span
                    className={`hidden items-center gap-1 font-medium sm:flex ${
                      day.isToday ? "text-accent-strong" : inMonth ? "text-ink" : "text-muted"
                    }`}
                  >
                    {day.date.getUTCDate()}
                    {hasEventos && !day.isToday && (
                      <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
                    )}
                  </span>
                  <div className="hidden flex-col gap-0.5 sm:flex">
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
                        <MessageDetailDialog
                          key={tarea.id}
                          message={tarea}
                          members={members}
                          onAssigneeChange={handleTareaAssigneeChange}
                          onSaved={handleTareaSaved}
                          onDeleted={handleDeleted}
                          onUndoDelete={handleUndoDelete}
                        >
                          <button
                            type="button"
                            title={`Tarea${vencida ? " vencida" : ""}: ${tarea.resumen}`}
                            aria-label={`Tarea${vencida ? " vencida" : ""}: ${tarea.resumen}`}
                            className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium transition-[filter] hover:brightness-95 ${tareaChipClass(vencida)}`}
                          >
                            <ListTodo aria-hidden size={10} className="shrink-0" />
                            {assignee && <Avatar email={assignee.email} size="xs" className="shrink-0" />}
                            <span className="truncate">{tarea.resumen}</span>
                          </button>
                        </MessageDetailDialog>
                      );
                    })}
                    {/* "+N más" era texto muerto: decía que había más pero no
                        daba forma de verlo. Ahora abre la ficha del día. */}
                    {ocultas > 0 && (
                      <DayDetailDialog
                        date={day.date}
                        eventos={dayEventos}
                        tareas={dayTareas}
                        members={members}
                        ahora={now}
                        onChanged={() => router.refresh()}
                        onTareaAssigneeChange={handleTareaAssigneeChange}
                        onTareaSaved={handleTareaSaved}
                        onDeleted={handleDeleted}
                        onUndoDelete={handleUndoDelete}
                      >
                        <button
                          type="button"
                          className="w-full rounded px-1 text-left text-[11px] text-muted underline-offset-2 transition-colors hover:text-accent-strong hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                          +{ocultas} más
                        </button>
                      </DayDetailDialog>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          {/* En vista día no hace falta ancho mínimo: una columna cabe en
              cualquier móvil, y forzarlo dejaría un scroll horizontal
              innecesario. */}
          <div style={{ minWidth: weekGrid.length > 1 ? 40 + weekGrid.length * 90 : undefined }}>
            <div className="grid gap-px pb-1" style={{ gridTemplateColumns: gridColumns(weekGrid.length) }}>
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
                style={{ gridTemplateColumns: gridColumns(weekGrid.length) }}
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
                            onAssigneeChange={handleTareaAssigneeChange}
                            onSaved={handleTareaSaved}
                            onDeleted={handleDeleted}
                            onUndoDelete={handleUndoDelete}
                          >
                            <button
                              type="button"
                              title={`Tarea${vencida ? " vencida" : ""}: ${tarea.resumen}`}
                            aria-label={`Tarea${vencida ? " vencida" : ""}: ${tarea.resumen}`}
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
              <div className="grid" style={{ gridTemplateColumns: gridColumns(weekGrid.length) }}>
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
