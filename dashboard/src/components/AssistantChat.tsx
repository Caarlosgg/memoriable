"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Send, CircleCheck, CalendarDays, CalendarClock, PiggyBank, Pencil, Trash2, UserRound, UserRoundX, Loader2 } from "lucide-react";
import { Avatar } from "./ui/avatar";
import { presentCategory } from "@/lib/categories";
import { formatEventDate, shortEmailName } from "@/lib/format";
import { dayLabel, dateKey } from "@/lib/calendar";
import { formatCentimos } from "@/lib/money";
import { useAssistant, type AssistantMessage } from "./AssistantProvider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { ConversationSidebar } from "./ConversationSidebar";
import { PageHeader } from "./PageHeader";
import { VoiceButton } from "./VoiceButton";

/**
 * Lo que se ofrece al abrir un chat vacío. No son ejemplos bonitos: son la
 * única pista de qué sabe hacer el Asistente. Por eso cubren capacidades
 * DISTINTAS (agenda, personas, equipos, notas) en vez de cuatro formas de
 * preguntar lo mismo — antes las cuatro eran sobre notas guardadas, así que
 * nadie llegaba a descubrir que también sabe de gente y de calendario.
 */
const SUGGESTED_QUESTIONS = [
  "¿Qué tengo esta semana?",
  "¿Quién va más cargado de trabajo?",
  "¿Qué tengo pendiente?",
  "¿Qué guardé esta semana?",
];

function textOf(message: AssistantMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string; state?: "streaming" | "done" } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Línea "asignado a X" (o aviso de que no se encontró a esa persona) — reutilizada por las tarjetas de crear/editar/asignar. */
function AsignadoLine({ asignadoA, asignacionNoEncontrada }: { asignadoA: string | null; asignacionNoEncontrada?: string }) {
  if (asignadoA) {
    return (
      <p className="mt-0.5 flex items-center gap-1 text-muted">
        <UserRound aria-hidden size={11} /> Asignado a {shortEmailName(asignadoA)}
      </p>
    );
  }
  if (asignacionNoEncontrada) {
    return (
      <p className="mt-0.5 flex items-center gap-1 text-danger">
        <UserRoundX aria-hidden size={11} /> No encontré a «{asignacionNoEncontrada}» en el equipo
      </p>
    );
  }
  return null;
}

type CrearNotaPart = Extract<AssistantMessage["parts"][number], { type: "tool-crearNota" }>;

function isCrearNotaPart(part: AssistantMessage["parts"][number]): part is CrearNotaPart {
  return part.type === "tool-crearNota";
}

/** Tarjetas de confirmación de lo que el Asistente ha creado en este mensaje. */
function CrearNotaResult({ part }: { part: CrearNotaPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        No se ha podido guardar: {part.errorText || "error desconocido"}.
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Guardando…</div>;
  }

  const s = part.output;
  const { Icon, color } = presentCategory(s.categoria);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <CircleCheck aria-hidden size={14} className="text-accent" />
        <Icon aria-hidden size={13} className={color} /> {s.label} guardada
      </p>
      <p className="mt-0.5 line-clamp-2 text-muted">{s.resumen}</p>
      <AsignadoLine asignadoA={s.asignadoA} asignacionNoEncontrada={s.asignacionNoEncontrada} />
    </div>
  );
}

type CrearEventoPart = Extract<AssistantMessage["parts"][number], { type: "tool-crearEvento" }>;

function isCrearEventoPart(part: AssistantMessage["parts"][number]): part is CrearEventoPart {
  return part.type === "tool-crearEvento";
}

/** Tarjeta de confirmación cuando el Asistente crea una cita/evento (Fase I). */
function CrearEventoResult({ part }: { part: CrearEventoPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        No se ha podido guardar el evento: {part.errorText || "error desconocido"}.
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Guardando…</div>;
  }

  const { eventos, asignacionNoEncontrada } = part.output;
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <CircleCheck aria-hidden size={14} className="text-accent" />
        <CalendarDays aria-hidden size={13} className="text-accent-strong" />
        {eventos.length > 1 ? `${eventos.length} eventos guardados` : "Evento guardado"}
      </p>
      {eventos.map((e) => (
        <p key={e.id} className="mt-0.5 text-muted">
          {e.titulo} · {formatEventDate(e.fechaInicio)}
          {e.ubicacion ? ` · ${e.ubicacion}` : ""}
        </p>
      ))}
      <AsignadoLine asignadoA={eventos[0]?.asignadoA ?? null} asignacionNoEncontrada={asignacionNoEncontrada} />
    </div>
  );
}

type CompletarTareaPart = Extract<AssistantMessage["parts"][number], { type: "tool-completarTarea" }>;

function isCompletarTareaPart(part: AssistantMessage["parts"][number]): part is CompletarTareaPart {
  return part.type === "tool-completarTarea";
}

/** Tarjeta de confirmación cuando el Asistente marca una tarea/recordatorio como hecho. */
function CompletarTareaResult({ part }: { part: CompletarTareaPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        {part.errorText || "No he encontrado esa tarea."}
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Buscando…</div>;
  }

  const t = part.output;
  const { Icon, color } = presentCategory(t.categoria);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <CircleCheck aria-hidden size={14} className="text-accent" />
        <Icon aria-hidden size={13} className={color} /> Marcada como hecha
      </p>
      <p className="mt-0.5 line-clamp-2 text-muted">{t.resumen}</p>
    </div>
  );
}

type AplazarTareaPart = Extract<AssistantMessage["parts"][number], { type: "tool-aplazarTarea" }>;

function isAplazarTareaPart(part: AssistantMessage["parts"][number]): part is AplazarTareaPart {
  return part.type === "tool-aplazarTarea";
}

/** Tarjeta de confirmación cuando el Asistente cambia (o quita) la fecha límite de una tarea/recordatorio. */
function AplazarTareaResult({ part }: { part: AplazarTareaPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        {part.errorText || "No he encontrado esa tarea."}
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Buscando…</div>;
  }

  const t = part.output;
  const { Icon, color } = presentCategory(t.categoria);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <CircleCheck aria-hidden size={14} className="text-accent" />
        <Icon aria-hidden size={13} className={color} />
        <CalendarClock aria-hidden size={13} className="text-accent-strong" />
        {t.fechaLimite ? `Aplazada a ${dayLabel(dateKey(new Date(t.fechaLimite))).toLowerCase()}` : "Fecha límite quitada"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-muted">{t.resumen}</p>
    </div>
  );
}

type AsignarTareaPart = Extract<AssistantMessage["parts"][number], { type: "tool-asignarTarea" }>;

function isAsignarTareaPart(part: AssistantMessage["parts"][number]): part is AsignarTareaPart {
  return part.type === "tool-asignarTarea";
}

/** Tarjeta de confirmación cuando el Asistente asigna (o quita la asignación de) una tarea/recordatorio. */
function AsignarTareaResult({ part }: { part: AsignarTareaPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        {part.errorText || "No he encontrado esa tarea o esa persona."}
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Buscando…</div>;
  }

  const t = part.output;
  const { Icon, color } = presentCategory(t.categoria);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <CircleCheck aria-hidden size={14} className="text-accent" />
        <Icon aria-hidden size={13} className={color} />
        {t.asignadoA ? `Asignada a ${shortEmailName(t.asignadoA)}` : "Asignación quitada"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-muted">{t.resumen}</p>
    </div>
  );
}

type RegistrarAhorroPart = Extract<AssistantMessage["parts"][number], { type: "tool-registrarAhorro" }>;

function isRegistrarAhorroPart(part: AssistantMessage["parts"][number]): part is RegistrarAhorroPart {
  return part.type === "tool-registrarAhorro";
}

/** Tarjeta de confirmación cuando el Asistente apunta un ingreso/retirada de una cuenta de ahorro. */
function RegistrarAhorroResultCard({ part }: { part: RegistrarAhorroPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        No se ha podido guardar el movimiento: {part.errorText || "error desconocido"}.
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Guardando…</div>;
  }

  const { movimientos } = part.output;
  const esIngreso = movimientos[0]!.centimos >= 0;
  const totalCentimos = movimientos.reduce((sum, m) => sum + m.centimos, 0);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <CircleCheck aria-hidden size={14} className="text-accent" />
        <PiggyBank aria-hidden size={13} className="text-accent-strong" />
        {movimientos.length > 1 ? `${movimientos.length} movimientos guardados` : "Movimiento guardado"}
      </p>
      {movimientos.length > 1 ? (
        <p className="mt-0.5 text-muted">
          {esIngreso ? "+" : ""}
          {formatCentimos(totalCentimos)} en total en {movimientos[0]!.cuentaNombre}
          {movimientos[0]!.cuentaCreada ? " (cuenta nueva)" : ""}
        </p>
      ) : (
        <p className="mt-0.5 text-muted">
          {esIngreso ? "+" : ""}
          {formatCentimos(movimientos[0]!.centimos)} en {movimientos[0]!.cuentaNombre}
          {movimientos[0]!.cuentaCreada ? " (cuenta nueva)" : ""}
        </p>
      )}
    </div>
  );
}

type EditarEventoPart = Extract<AssistantMessage["parts"][number], { type: "tool-editarEvento" }>;

function isEditarEventoPart(part: AssistantMessage["parts"][number]): part is EditarEventoPart {
  return part.type === "tool-editarEvento";
}

/** Tarjeta de confirmación cuando el Asistente edita un evento existente. */
function EditarEventoResult({ part }: { part: EditarEventoPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        No se ha podido editar el evento: {part.errorText || "error desconocido"}.
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Buscando…</div>;
  }

  const e = part.output;
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <CircleCheck aria-hidden size={14} className="text-accent" />
        <Pencil aria-hidden size={13} className="text-accent-strong" /> Evento actualizado
      </p>
      <p className="mt-0.5 text-muted">
        {e.titulo} · {formatEventDate(e.fechaInicio)}
        {e.ubicacion ? ` · ${e.ubicacion}` : ""}
      </p>
      <AsignadoLine asignadoA={e.asignadoA} asignacionNoEncontrada={e.asignacionNoEncontrada} />
    </div>
  );
}

type BorrarEventoPart = Extract<AssistantMessage["parts"][number], { type: "tool-borrarEvento" }>;

function isBorrarEventoPart(part: AssistantMessage["parts"][number]): part is BorrarEventoPart {
  return part.type === "tool-borrarEvento";
}

/** Tarjeta de confirmación cuando el Asistente borra un evento. */
function BorrarEventoResult({ part }: { part: BorrarEventoPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        {part.errorText || "No he encontrado ese evento."}
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Buscando…</div>;
  }

  const e = part.output;
  return (
    <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <Trash2 aria-hidden size={13} className="text-danger" /> Evento borrado
      </p>
      <p className="mt-0.5 text-muted">{e.titulo}</p>
    </div>
  );
}

type ConsultarAhorrosPart = Extract<AssistantMessage["parts"][number], { type: "tool-consultarAhorros" }>;

function isConsultarAhorrosPart(part: AssistantMessage["parts"][number]): part is ConsultarAhorrosPart {
  return part.type === "tool-consultarAhorros";
}

/** Tarjeta con el dato consultado (de solo lectura, no cambia nada). */
function ConsultarAhorrosResultCard({ part }: { part: ConsultarAhorrosPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        {part.errorText || "No he podido consultar tus ahorros."}
      </div>
    );
  }

  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Consultando…</div>;
  }

  const r = part.output;
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <PiggyBank aria-hidden size={13} className="text-accent-strong" />
        {r.cuentas.length === 1 ? r.cuentas[0]!.nombre : "Total ahorrado"}
      </p>
      <p className="mt-0.5 text-muted">{formatCentimos(r.totalCentimos)}</p>
    </div>
  );
}

type ConsultarPersonaPart = Extract<AssistantMessage["parts"][number], { type: "tool-consultarPersona" }>;

function isConsultarPersonaPart(part: AssistantMessage["parts"][number]): part is ConsultarPersonaPart {
  return part.type === "tool-consultarPersona";
}

/**
 * Ficha de una persona. Con tarjeta y no solo narrada por el modelo porque
 * es información de ESTRUCTURA (equipos, carga, vencidas, próximas citas):
 * en un párrafo hay que leerla entera para encontrar el dato que buscabas,
 * y además cada tarea se vuelve accionable desde aquí.
 */
function ConsultarPersonaResultCard({ part }: { part: ConsultarPersonaPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        {part.errorText || "No he podido consultar a esa persona."}
      </div>
    );
  }
  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Consultando…</div>;
  }

  const p = part.output;
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-3 text-xs">
      <div className="flex items-center gap-2">
        <Avatar email={p.email} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{shortEmailName(p.email)}</p>
          <p className="text-muted">
            {p.enLinea ? "en línea" : "desconectado"}
            {p.equipos.length > 0 && ` · ${p.equipos.map((e) => e.nombre).join(", ")}`}
          </p>
        </div>
      </div>

      {p.trabajandoAhora && (
        <p className="mt-2 flex items-start gap-1.5 text-ink">
          <Loader2 aria-hidden size={12} className="mt-0.5 shrink-0 animate-spin text-accent-strong motion-reduce:animate-none" />
          <span>Ahora: {p.trabajandoAhora}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted">
        <span>{p.totalTareasAbiertas} abierta{p.totalTareasAbiertas === 1 ? "" : "s"}</span>
        {p.vencidas > 0 && <span className="font-medium text-danger">{p.vencidas} vencida{p.vencidas === 1 ? "" : "s"}</span>}
        <span>{p.completadasUltimaSemana} hecha{p.completadasUltimaSemana === 1 ? "" : "s"} esta semana</span>
      </div>

      {p.tareas.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-accent/20 pt-2">
          {p.tareas.slice(0, 5).map((t, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${t.vencida ? "bg-danger" : "bg-accent"}`} />
              <span className="min-w-0 flex-1 text-ink">
                {t.resumen}
                {t.fechaLimite && (
                  <span className={t.vencida ? "text-danger" : "text-muted"}> · {t.fechaLimite}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {p.eventosProximos.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-accent/20 pt-2">
          {p.eventosProximos.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-muted">
              <CalendarDays aria-hidden size={12} className="mt-0.5 shrink-0 text-accent-strong" />
              <span className="text-ink">{e.titulo}</span> · {e.fecha}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ConsultarAgendaPart = Extract<AssistantMessage["parts"][number], { type: "tool-consultarAgenda" }>;

function isConsultarAgendaPart(part: AssistantMessage["parts"][number]): part is ConsultarAgendaPart {
  return part.type === "tool-consultarAgenda";
}

/** Lo que hay en un tramo de fechas, en orden — citas y vencimientos mezclados, como se viven. */
function ConsultarAgendaResultCard({ part }: { part: ConsultarAgendaPart }) {
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
        {part.errorText || "No he podido consultar la agenda."}
      </div>
    );
  }
  if (part.state !== "output-available" || !part.output) {
    return <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">Consultando…</div>;
  }

  const { items } = part.output;
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-paper-line bg-paper p-2.5 text-xs text-muted">
        Nada con fecha en ese tramo.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-3 text-xs">
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {item.tipo === "evento" ? (
              <CalendarDays aria-hidden size={12} className="mt-0.5 shrink-0 text-accent-strong" />
            ) : (
              <CalendarClock aria-hidden size={12} className="mt-0.5 shrink-0 text-muted" />
            )}
            <span className="min-w-0 flex-1">
              <span className="text-ink">{item.titulo}</span>
              <span className="text-muted">
                {" · "}
                {item.fecha}
                {item.asignadoA && ` · ${shortEmailName(item.asignadoA)}`}
                {item.equipo !== "Personal" && ` · ${item.equipo}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Puramente presentacional: todo el estado (useChat, conversación activa,
 * lista de conversaciones) vive en `AssistantProvider`, montado en el
 * layout del dashboard — así sobrevive a navegar a otra pantalla mientras
 * el Asistente sigue respondiendo (ver el comentario allí).
 */
export function AssistantChat({ puedeGrabar }: { puedeGrabar: boolean }) {
  const {
    messages,
    isBusy,
    error,
    clearError,
    conversationId,
    conversations,
    input,
    setInput,
    handleSend,
    handleNewConversation,
    handleSelectConversation,
  } = useAssistant();

  // Seguir la respuesta según se escribe, sin tener que arrastrar a mano.
  // Depende de `messages` entero (no de `messages.length`): mientras el
  // Asistente responde, el número de mensajes no cambia — lo que crece es
  // el texto del último, que es justo cuando más falta hace seguirlo.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    // Altura acotada + scroll DENTRO de la zona de mensajes: antes la
    // sección crecía con la conversación y estiraba la página entera, así
    // que tras unos cuantos turnos había que bajar mucho para llegar al
    // campo de escribir. `dvh` y no `vh` por el móvil: con `vh`, al abrir
    // el teclado el campo quedaba tapado.
    <section aria-label="Asistente" className="flex min-h-0 flex-col gap-4 h-[calc(100dvh-13rem)] sm:h-[calc(100dvh-9rem)]">
      <PageHeader
        title="Asistente"
        help={
          <>
            Pregúntale por tus notas, tareas y eventos guardados — responde citando lo que encuentra, en vez de
            inventarlo. También puede actuar por ti: crear notas y citas, marcar tareas como hechas o aplazarlas,
            asignarlas a compañeros de equipo, editar o borrar eventos, y apuntar/consultar tus ahorros, todo con
            lenguaje natural. Sigue trabajando aunque navegues a otra pantalla — verás un puntito en el menú
            mientras piensa.
          </>
        }
      />

      <ConversationSidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
      />

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {messages.length === 0 && (
        <div className="fade-in flex flex-col gap-3 rounded-2xl border border-dashed border-paper-line bg-paper-raised/60 p-6 text-center">
          <p className="font-display text-lg text-ink">Pregúntame sobre tus notas</p>
          <p className="text-sm text-muted">
            Busco entre lo que has guardado y te respondo con tus propias palabras.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(q)}
                className="rounded-full border border-paper-line bg-paper px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] motion-reduce:active:scale-100"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <ul className="flex flex-col gap-4">
          {messages.map((message) => {
            const sources = message.metadata?.sources ?? [];
            const text = textOf(message);
            const crearNotaParts = message.parts.filter(isCrearNotaPart);
            const crearEventoParts = message.parts.filter(isCrearEventoPart);
            const completarTareaParts = message.parts.filter(isCompletarTareaPart);
            const aplazarTareaParts = message.parts.filter(isAplazarTareaPart);
            const asignarTareaParts = message.parts.filter(isAsignarTareaPart);
            const registrarAhorroParts = message.parts.filter(isRegistrarAhorroPart);
            const editarEventoParts = message.parts.filter(isEditarEventoPart);
            const borrarEventoParts = message.parts.filter(isBorrarEventoPart);
            const consultarAhorrosParts = message.parts.filter(isConsultarAhorrosPart);
            const consultarPersonaParts = message.parts.filter(isConsultarPersonaPart);
            const consultarAgendaParts = message.parts.filter(isConsultarAgendaPart);
            const hasToolResults =
              crearNotaParts.length > 0 ||
              crearEventoParts.length > 0 ||
              completarTareaParts.length > 0 ||
              aplazarTareaParts.length > 0 ||
              asignarTareaParts.length > 0 ||
              registrarAhorroParts.length > 0 ||
              editarEventoParts.length > 0 ||
              borrarEventoParts.length > 0 ||
              consultarAhorrosParts.length > 0 ||
              consultarPersonaParts.length > 0 ||
              consultarAgendaParts.length > 0;

            return (
              <li key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {message.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-accent-ink">
                    {text}
                  </div>
                ) : (
                  <div className="flex max-w-[85%] flex-col gap-2">
                    {crearNotaParts.map((part) => (
                      <CrearNotaResult key={part.toolCallId} part={part} />
                    ))}
                    {crearEventoParts.map((part) => (
                      <CrearEventoResult key={part.toolCallId} part={part} />
                    ))}
                    {completarTareaParts.map((part) => (
                      <CompletarTareaResult key={part.toolCallId} part={part} />
                    ))}
                    {aplazarTareaParts.map((part) => (
                      <AplazarTareaResult key={part.toolCallId} part={part} />
                    ))}
                    {asignarTareaParts.map((part) => (
                      <AsignarTareaResult key={part.toolCallId} part={part} />
                    ))}
                    {registrarAhorroParts.map((part) => (
                      <RegistrarAhorroResultCard key={part.toolCallId} part={part} />
                    ))}
                    {editarEventoParts.map((part) => (
                      <EditarEventoResult key={part.toolCallId} part={part} />
                    ))}
                    {borrarEventoParts.map((part) => (
                      <BorrarEventoResult key={part.toolCallId} part={part} />
                    ))}
                    {consultarAhorrosParts.map((part) => (
                      <ConsultarAhorrosResultCard key={part.toolCallId} part={part} />
                    ))}
                    {consultarPersonaParts.map((part) => (
                      <ConsultarPersonaResultCard key={part.toolCallId} part={part} />
                    ))}
                    {consultarAgendaParts.map((part) => (
                      <ConsultarAgendaResultCard key={part.toolCallId} part={part} />
                    ))}
                    {(text || isBusy || !hasToolResults) && (
                      <div className="fade-in rounded-2xl rounded-bl-sm border border-paper-line bg-paper-raised px-4 py-2.5 text-sm text-ink">
                        {text ? <AssistantMarkdown text={text} /> : isBusy ? "…" : ""}
                      </div>
                    )}
                    {sources.length > 0 && (
                      <details className="text-xs text-muted">
                        <summary className="w-fit cursor-pointer select-none rounded font-medium text-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          {sources.length} nota{sources.length === 1 ? "" : "s"} usada{sources.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 flex flex-col gap-2">
                          {sources.map((s) => {
                            const { Icon, color } = presentCategory(s.categoria);
                            return (
                              <li key={s.id}>
                                <Link
                                  href={`/categorias?mensaje=${s.id}#mensaje-${s.id}`}
                                  className="block rounded-lg border border-paper-line bg-paper p-2.5 transition-colors hover:border-accent hover:bg-accent-soft"
                                >
                                  <p className="flex items-center gap-1.5 font-medium text-ink">
                                    <Icon aria-hidden size={13} className={color} /> {s.label} · {s.fecha}
                                  </p>
                                  <p className="mt-0.5 line-clamp-2 text-muted">{s.contenido}</p>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>

      {error && (
        <div role="alert" className="fade-in rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <p>{error.message || "No se ha podido generar una respuesta."}</p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => clearError()}
            className="mt-2 focus-visible:ring-danger"
          >
            Entendido
          </Button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="flex gap-2"
      >
        <label htmlFor="asistente-input" className="sr-only">
          Escribe tu pregunta al Asistente
        </label>
        <Input
          id="asistente-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          disabled={isBusy}
          className="flex-1"
        />
        <VoiceButton
          puedeGrabar={puedeGrabar}
          onTranscript={(texto) => setInput(input ? `${input} ${texto}` : texto)}
        />
        <Button type="submit" disabled={isBusy || input.trim() === ""}>
          {isBusy ? "…" : <Send aria-hidden size={16} />}
          <span className="sr-only sm:not-sr-only">Enviar</span>
        </Button>
      </form>
    </section>
  );
}
