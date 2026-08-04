"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage, InferUITools, UIDataTypes } from "ai";
import { MessageCircle, Send, CircleCheck } from "lucide-react";
import type { AssistantSource } from "@/lib/assistantContext";
import type { AssistantTools } from "@/lib/assistantTools";
import type { ExchangeDayGroup, ExchangeLike } from "@/lib/groupExchangesByDay";
import { presentCategory } from "@/lib/categories";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { AssistantHistoryPanel } from "./AssistantHistoryPanel";

type AssistantMessage = UIMessage<{ sources?: AssistantSource[] }, UIDataTypes, InferUITools<AssistantTools>>;

/**
 * Reconstruye un intercambio guardado como el par de mensajes que
 * `useChat` espera. No lleva `metadata.sources`: el historial solo guarda
 * pregunta+respuesta en texto, no qué notas se usaron — al recuperarlo no
 * se muestra el desplegable de fuentes (aceptable: es una respuesta ya
 * dada, no hace falta poder re-explorar sus fuentes).
 */
function exchangeToMessages(exchange: ExchangeLike): AssistantMessage[] {
  return [
    { id: `${exchange.id}-q`, role: "user", parts: [{ type: "text", text: exchange.pregunta }] },
    { id: `${exchange.id}-a`, role: "assistant", parts: [{ type: "text", text: exchange.respuesta }] },
  ];
}

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

export function AssistantChat({ initialHistory = [] }: { initialHistory?: ExchangeDayGroup[] }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages, status, error, clearError } = useChat<AssistantMessage>({
    transport: new DefaultChatTransport({ api: "/api/asistente" }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (trimmed === "" || isBusy) return;
    clearError();
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <section aria-labelledby="asistente-heading" className="flex flex-col gap-4">
      <h2
        id="asistente-heading"
        className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        <MessageCircle aria-hidden size={14} /> Asistente
      </h2>

      <AssistantHistoryPanel
        groups={initialHistory}
        onSelect={(exchange) => {
          clearError();
          setMessages(exchangeToMessages(exchange));
        }}
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
                className="rounded-full border border-paper-line bg-paper px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:bg-accent-soft"
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
                    {(text || isBusy || crearNotaParts.length === 0) && (
                      <div className="fade-in rounded-2xl rounded-bl-sm border border-paper-line bg-paper-raised px-4 py-2.5 text-sm text-ink">
                        {text ? <AssistantMarkdown text={text} /> : isBusy ? "…" : ""}
                      </div>
                    )}
                    {sources.length > 0 && (
                      <details className="text-xs text-muted">
                        <summary className="cursor-pointer select-none font-medium text-accent hover:text-accent-strong">
                          {sources.length} nota{sources.length === 1 ? "" : "s"} usada{sources.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 flex flex-col gap-2">
                          {sources.map((s) => {
                            const { Icon, color } = presentCategory(s.categoria);
                            return (
                              <li key={s.id} className="rounded-lg border border-paper-line bg-paper p-2.5">
                                <p className="flex items-center gap-1.5 font-medium text-ink">
                                  <Icon aria-hidden size={13} className={color} /> {s.label} · {s.fecha}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-muted">{s.contenido}</p>
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
