"use client";

import { useState } from "react";
import { History, ChevronUp, ChevronDown, Plus } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { ConversationSummary } from "@/lib/assistantHistory";
import { Button } from "./ui/button";

/**
 * Lista de conversaciones del Asistente, como el historial de Claude: cada
 * una es un hilo real (varios turnos), no una pregunta-respuesta suelta.
 * Colapsada por defecto — igual criterio que el viejo panel de historial
 * por día que sustituye: no debe competir visualmente con el chat en curso.
 */
export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium text-ink transition-colors hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <History aria-hidden size={15} />
          Conversaciones
          <span aria-hidden className="text-muted">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={onNew}>
          <Plus aria-hidden size={14} /> Nueva
        </Button>
      </div>

      {open && (
        <div className="fade-in flex max-h-80 flex-col gap-1 overflow-y-auto border-t border-paper-line p-2">
          {conversations.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted">Todavía no hay conversaciones.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                }}
                aria-current={c.id === activeId ? "true" : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  c.id === activeId ? "bg-accent-soft text-accent-strong" : "text-ink hover:bg-accent-soft"
                }`}
              >
                <p className="truncate font-medium">{c.titulo}</p>
                <p className="truncate text-xs text-muted">{formatDate(c.updatedAt)}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
