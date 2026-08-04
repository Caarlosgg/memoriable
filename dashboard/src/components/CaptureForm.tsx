"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PenLine, Check } from "lucide-react";
import { capture, type CaptureState } from "@/app/(dashboard)/actions";
import { presentCategory } from "@/lib/categories";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const initialState: CaptureState = {};

/**
 * Captura rápida: un input que pasa por el MISMO pipeline que el bot de
 * Telegram (categorización + resumen + guardado), ver src/lib/pipeline.ts y
 * la server action `capture` en actions.ts.
 */
export function CaptureForm() {
  const [state, formAction, pending] = useActionState(capture, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // "Guardado ✓" en el propio botón como confirmación inmediata (además del
  // texto de abajo). Se resuelve con estado derivado en render — el patrón
  // que React recomienda para "ajustar estado cuando cambia un valor", en
  // vez de setState dentro de un efecto: al detectar un guardado nuevo se
  // reinicia el descarte; la confirmación se mantiene hasta que el usuario
  // vuelve a escribir (onChange), lo que es mejor UX que un timer.
  const savedId = state.saved?.id ?? null;
  const [seenSavedId, setSeenSavedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (savedId !== seenSavedId) {
    setSeenSavedId(savedId);
    setDismissed(false);
  }
  const justSaved = savedId !== null && !dismissed;

  // Efecto SOLO para el side-effect en el DOM (vaciar el input no controlado
  // tras guardar). No toca estado de React, así que no dispara el aviso de
  // setState-en-efecto.
  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  const saved = state.saved ? presentCategory(state.saved.categoria) : null;

  return (
    <section
      aria-labelledby="captura-heading"
      className="fade-in flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm"
    >
      <h2
        id="captura-heading"
        className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        <PenLine aria-hidden size={14} /> Anotar algo
      </h2>

      <form ref={formRef} action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="contenido" className="sr-only">
          Escribe una idea, tarea, pregunta o recordatorio
        </label>
        <Input
          id="contenido"
          name="contenido"
          type="text"
          required
          placeholder="Una idea, una tarea, un recordatorio…"
          aria-describedby={state.error ? "captura-error" : undefined}
          onChange={() => setDismissed(true)}
          className="flex-1"
        />
        <Button type="submit" disabled={pending} className={justSaved ? "bg-accent-strong" : ""}>
          {pending ? (
            "Guardando…"
          ) : justSaved ? (
            <>
              <Check aria-hidden size={16} /> Guardado
            </>
          ) : (
            "Guardar"
          )}
        </Button>
      </form>

      {state.error && (
        <p id="captura-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      {state.saved && saved && !dismissed && (
        <p role="status" className="fade-in flex items-center gap-1.5 text-sm text-muted">
          Guardado como{" "}
          <span className={`inline-flex items-center gap-1 font-medium ${saved.color}`}>
            <saved.Icon aria-hidden size={13} /> {saved.label}
          </span>
          : «{state.saved.resumen}»
        </p>
      )}
    </section>
  );
}
