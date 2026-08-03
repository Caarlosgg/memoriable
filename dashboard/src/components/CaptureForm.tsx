"use client";

import { useActionState, useEffect, useRef } from "react";
import { capture, type CaptureState } from "@/app/(dashboard)/actions";
import { presentCategory } from "@/lib/categories";

const initialState: CaptureState = {};

/**
 * Captura rápida: un input que pasa por el MISMO pipeline que el bot de
 * Telegram (categorización + resumen + guardado), ver src/lib/pipeline.ts y
 * la server action `capture` en actions.ts.
 */
export function CaptureForm() {
  const [state, formAction, pending] = useActionState(capture, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  return (
    <section
      aria-labelledby="captura-heading"
      className="fade-in flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm"
    >
      <h2
        id="captura-heading"
        className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        ✍️ Anotar algo
      </h2>

      <form ref={formRef} action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="contenido" className="sr-only">
          Escribe una idea, tarea, pregunta o recordatorio
        </label>
        <input
          id="contenido"
          name="contenido"
          type="text"
          required
          placeholder="Una idea, una tarea, un recordatorio…"
          aria-describedby={state.error ? "captura-error" : undefined}
          className="w-full flex-1 rounded-lg border border-paper-line bg-paper px-4 py-2.5 text-base text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-all hover:-translate-y-px hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </form>

      {state.error && (
        <p id="captura-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      {state.saved && (
        <p role="status" className="fade-in text-sm text-muted">
          Guardado como{" "}
          <span className="font-medium text-accent-strong">
            {presentCategory(state.saved.categoria).emoji} {presentCategory(state.saved.categoria).label}
          </span>
          : «{state.saved.resumen}»
        </p>
      )}
    </section>
  );
}
