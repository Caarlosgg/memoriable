"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import type { AssistantSource } from "@/lib/assistantContext";

type AssistantMessage = UIMessage<{ sources?: AssistantSource[] }>;

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

export function AssistantChat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, clearError } = useChat<AssistantMessage>({
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
      <h2 id="asistente-heading" className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent">
        💬 Asistente
      </h2>

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

            return (
              <li key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {message.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-accent-ink">
                    {text}
                  </div>
                ) : (
                  <div className="flex max-w-[85%] flex-col gap-2">
                    <div className="fade-in rounded-2xl rounded-bl-sm border border-paper-line bg-paper-raised px-4 py-2.5 text-sm text-ink">
                      {text || (isBusy ? "…" : "")}
                    </div>
                    {sources.length > 0 && (
                      <details className="text-xs text-muted">
                        <summary className="cursor-pointer select-none font-medium text-accent hover:text-accent-strong">
                          {sources.length} nota{sources.length === 1 ? "" : "s"} usada{sources.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 flex flex-col gap-2">
                          {sources.map((s) => (
                            <li key={s.id} className="rounded-lg border border-paper-line bg-paper p-2.5">
                              <p className="font-medium text-ink">
                                {s.emoji} {s.label} · {s.fecha}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-muted">{s.contenido}</p>
                            </li>
                          ))}
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
          <button
            type="button"
            onClick={() => clearError()}
            className="mt-2 rounded-full bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Entendido
          </button>
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
        <input
          id="asistente-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          disabled={isBusy}
          className="w-full flex-1 rounded-lg border border-paper-line bg-paper px-4 py-2.5 text-base text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isBusy || input.trim() === ""}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-all hover:-translate-y-px hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isBusy ? "…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}
