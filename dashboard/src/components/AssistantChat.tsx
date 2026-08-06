"use client";

import Link from "next/link";
import { MessageCircle, Send, CircleCheck, CalendarDays, PiggyBank, Pencil, Trash2 } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { formatEventDate } from "@/lib/format";
import { formatCentimos } from "@/lib/money";
import { useAssistant, type AssistantMessage } from "./AssistantProvider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { ConversationSidebar } from "./ConversationSidebar";

const SUGGESTED_QUESTIONS = [
  "¿Qué tengo pendiente?",
  "¿Qué guardé esta semana?",
  "Resúmeme mis ideas guardadas",
  "¿Tengo algo pendiente sobre el curso?",
];

function textOf(message: AssistantMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string; state?: "streaming" | "done" } => p.type === "text")
    .map((p) => p.text)
    .join("");
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

  const { eventos } = part.output;
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

/**
 * Puramente presentacional: todo el estado (useChat, conversación activa,
 * lista de conversaciones) vive en `AssistantProvider`, montado en el
 * layout del dashboard — así sobrevive a navegar a otra pantalla mientras
 * el Asistente sigue respondiendo (ver el comentario allí).
 */
export function AssistantChat() {
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

  return (
    <section aria-labelledby="asistente-heading" className="flex flex-col gap-4">
      <h2
        id="asistente-heading"
        className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        <MessageCircle aria-hidden size={14} /> Asistente
      </h2>

      <ConversationSidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
      />

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
            const registrarAhorroParts = message.parts.filter(isRegistrarAhorroPart);
            const editarEventoParts = message.parts.filter(isEditarEventoPart);
            const borrarEventoParts = message.parts.filter(isBorrarEventoPart);
            const consultarAhorrosParts = message.parts.filter(isConsultarAhorrosPart);
            const hasToolResults =
              crearNotaParts.length > 0 ||
              crearEventoParts.length > 0 ||
              completarTareaParts.length > 0 ||
              registrarAhorroParts.length > 0 ||
              editarEventoParts.length > 0 ||
              borrarEventoParts.length > 0 ||
              consultarAhorrosParts.length > 0;

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
        <Button type="submit" disabled={isBusy || input.trim() === ""}>
          {isBusy ? "…" : <Send aria-hidden size={16} />}
          <span className="sr-only sm:not-sr-only">Enviar</span>
        </Button>
      </form>
    </section>
  );
}
