"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Message, EstadoTarea } from "@prisma/client";
import { ESTADO_PRESENTATION } from "@/lib/kanban";
import { KanbanCard } from "./KanbanCard";

export function KanbanColumn({ estado, messages }: { estado: EstadoTarea; messages: Message[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: estado });
  const { label, Icon } = ESTADO_PRESENTATION[estado];

  return (
    <section
      aria-labelledby={`columna-${estado}`}
      className={`flex min-w-[260px] flex-1 flex-col gap-3 rounded-2xl border p-3 transition-colors ${
        isOver ? "border-accent bg-accent-soft/60" : "border-paper-line bg-paper-raised/60"
      }`}
    >
      <h3
        id={`columna-${estado}`}
        className="flex items-center gap-2 text-sm font-semibold text-ink"
      >
        <Icon aria-hidden size={16} className="text-accent" />
        {label}
        <span className="ml-auto rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-muted">
          {messages.length}
        </span>
      </h3>

      <ul ref={setNodeRef} className="flex min-h-[80px] flex-col gap-2.5">
        {messages.length === 0 ? (
          <li className="rounded-lg border border-dashed border-paper-line p-4 text-center text-xs text-muted">
            Nada por aquí.
          </li>
        ) : (
          messages.map((message) => <KanbanCard key={message.id} message={message} />)
        )}
      </ul>
    </section>
  );
}
