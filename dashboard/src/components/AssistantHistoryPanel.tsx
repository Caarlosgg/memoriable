"use client";

import { useState } from "react";
import type { ExchangeDayGroup, ExchangeLike } from "@/lib/groupExchangesByDay";
import { formatDate } from "@/lib/format";

/**
 * Historial reciente del Asistente, agrupado por día. Colapsado por
 * defecto (no debe competir visualmente con la pantalla de inicio ni con
 * el chat en curso) — un botón lo despliega. Al hacer click en un
 * intercambio, se vuelve a mostrar en el chat (ver AssistantChat.tsx).
 */
export function AssistantHistoryPanel({
  groups,
  onSelect,
}: {
  groups: ExchangeDayGroup[];
  onSelect: (exchange: ExchangeLike) => void;
}) {
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-accent-soft"
      >
        <span>🕐 Historial reciente</span>
        <span aria-hidden className="text-muted">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="fade-in flex max-h-80 flex-col gap-4 overflow-y-auto border-t border-paper-line p-4">
          {groups.map((group) => (
            <div key={group.day} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</p>
              <ul className="flex flex-col gap-1.5">
                {group.exchanges.map((exchange) => (
                  <li key={exchange.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(exchange);
                        setOpen(false);
                      }}
                      className="w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-left text-sm transition-colors hover:border-accent hover:bg-accent-soft"
                    >
                      <p className="truncate font-medium text-ink">{exchange.pregunta}</p>
                      <p className="truncate text-xs text-muted">{formatDate(exchange.fecha)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
