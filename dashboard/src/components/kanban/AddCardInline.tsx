"use client";

import { useState, useTransition } from "react";
import type { Message } from "@prisma/client";
import { Plus } from "lucide-react";
import { crearTareaEnColumna } from "@/app/(dashboard)/actions";

/**
 * Añadir una tarjeta desde la propia columna.
 *
 * El tablero solo se podía llenar desde otra pantalla o desde el bot: un
 * kanban en el que no se puede añadir una tarjeta te echa fuera justo
 * cuando estás organizando. Aquí se escribe y se queda, sin salir.
 *
 * Se mantiene abierto tras guardar (y el input enfocado) porque cuando
 * alguien añade una tarea rara vez añade solo una — cerrarse tras cada
 * guardado obligaría a volver a pulsar "+" para cada línea.
 */
export function AddCardInline({
  columnaId,
  onCreated,
}: {
  columnaId: string;
  /** La tarjeta ya guardada y categorizada por el servidor — el tablero la coloca sin recargar. */
  onCreated: (message: Message) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar() {
    const trimmed = texto.trim();
    if (!trimmed || pending) return;
    setAviso(null);
    startTransition(async () => {
      const result = await crearTareaEnColumna(trimmed, columnaId);
      // `message` y `error` pueden venir LOS DOS: la nota se guardó, pero
      // el pipeline la categorizó como algo que no sale en el tablero. Se
      // avisa y se limpia igual — está guardada de verdad.
      if (result.message) {
        onCreated(result.message);
        setTexto("");
      }
      if (result.error) setAviso(result.error);
    });
  }

  function cerrar() {
    setAbierto(false);
    setTexto("");
    setAviso(null);
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-paper-line py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <Plus aria-hidden size={14} /> Añadir tarea
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // Enter guarda, Mayús+Enter hace salto de línea: lo que se espera
          // de un campo de "añadir rápido", no de un formulario.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            guardar();
          }
          if (e.key === "Escape") cerrar();
        }}
        onBlur={(e) => {
          // Solo se cierra si el foco sale del bloque entero y no hay nada
          // escrito — cerrarse llevándose el texto sería perder trabajo.
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget) && texto.trim() === "") cerrar();
        }}
        rows={2}
        maxLength={500}
        placeholder="Llamar al proveedor…"
        aria-label="Descripción de la tarea nueva"
        className="w-full resize-none rounded-lg border border-accent bg-paper p-2 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      {aviso && (
        <p role="alert" className="text-[11px] text-danger">
          {aviso}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pending || texto.trim() === ""}
          className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink transition-[filter] hover:brightness-95 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Añadir"}
        </button>
        <button type="button" onClick={cerrar} className="text-xs text-muted transition-colors hover:text-ink">
          Cancelar
        </button>
        <span className="ml-auto text-[10px] text-muted">Enter para guardar</span>
      </div>
    </div>
  );
}
