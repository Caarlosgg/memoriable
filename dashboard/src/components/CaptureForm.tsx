"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PenLine, Check } from "lucide-react";
import { capture, type CaptureState } from "@/app/(dashboard)/actions";
import { presentCategory } from "@/lib/categories";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { VoiceButton } from "./VoiceButton";
import { useEsMac } from "@/lib/useEsMac";

const initialState: CaptureState = {};

/**
 * Captura rápida: un input que pasa por el MISMO pipeline que el bot de
 * Telegram (categorización + resumen + guardado), ver src/lib/pipeline.ts y
 * la server action `capture` en actions.ts.
 */
export function CaptureForm({ puedeGrabar }: { puedeGrabar: boolean }) {
  const [state, formAction, pending] = useActionState(capture, initialState);
  const esMac = useEsMac();
  const formRef = useRef<HTMLFormElement>(null);
  // El campo es NO controlado (se lee por `name` al enviar el form, se
  // vacía con `formRef.current?.reset()`), así que dictar no puede pasar
  // por un `setState` — se escribe en el DOM directamente, igual que
  // cualquier otro cambio manual del usuario.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  function handleTranscript(texto: string) {
    const el = inputRef.current;
    if (!el) return;
    el.value = el.value ? `${el.value} ${texto}` : texto;
    setDismissed(true);
    el.focus();
  }

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

  /**
   * Enfoca el campo cuando se llega con `#capturar` (lo pone "Anotar algo
   * nuevo" en la paleta de comandos).
   *
   * Antes ese comando solo NAVEGABA a /notas y dejaba al usuario buscando
   * dónde escribir — el mismo problema que tenían todos los comandos de la
   * paleta: parecían acciones y solo eran enlaces.
   *
   * Se escucha también `hashchange` porque, estando ya en /notas, Next no
   * remonta nada al navegar al mismo sitio con otro hash.
   */
  useEffect(() => {
    const enfocarSiToca = () => {
      if (window.location.hash !== "#capturar") return;
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    enfocarSiToca();
    window.addEventListener("hashchange", enfocarSiToca);
    return () => window.removeEventListener("hashchange", enfocarSiToca);
  }, []);

  /**
   * Ctrl/Cmd+Enter guarda. En un `<input>` de una línea, Enter enviaba el
   * formulario solo; al pasar a textarea, Enter tiene que hacer lo que se
   * espera en un textarea (salto de línea) — sin este atajo, guardar
   * obligaría a soltar el teclado e ir al botón con el ratón.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

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

      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        <label htmlFor="contenido" className="sr-only">
          Escribe una idea, tarea, pregunta o recordatorio
        </label>
        {/* Textarea y no `<input>`: era de UNA línea, así que pegar un
            párrafo o escribir algo con varios puntos era incómodo hasta el
            punto de empujar a abrir Telegram para dictarlo. Crece con el
            contenido (`field-sizing-content`) en vez de dejar un bloque
            grande vacío ocupando la pantalla al entrar. */}
        <Textarea
          ref={inputRef}
          id="contenido"
          name="contenido"
          required
          rows={2}
          placeholder="Una idea, una tarea, un recordatorio…"
          aria-describedby={state.error ? "captura-error" : "captura-atajo"}
          onChange={() => setDismissed(true)}
          onKeyDown={handleKeyDown}
          className="field-sizing-content max-h-60 min-h-[calc(2lh+1.25rem)] resize-none"
        />
        <div className="flex items-center gap-2">
          <p id="captura-atajo" className="mr-auto hidden text-xs text-muted sm:block">
            <kbd className="rounded border border-paper-line bg-paper px-1 py-0.5 font-mono text-[10px]">
              {esMac ? "⌘" : "Ctrl"}
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-paper-line bg-paper px-1 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>{" "}
            para guardar
          </p>
          <VoiceButton puedeGrabar={puedeGrabar} onTranscript={handleTranscript} />
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
        </div>
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
