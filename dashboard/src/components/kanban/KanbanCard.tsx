"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Message } from "@prisma/client";
import { Clock } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { PRIORIDAD_PRESENTATION, PRIORIDAD_ICON, nextPriority } from "@/lib/kanban";
import { formatDate } from "@/lib/format";
import { updateTaskPriority } from "@/app/(dashboard)/actions";

export function KanbanCard({ message }: { message: Message }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: message.id });
  const { Icon: CategoryIcon, color } = presentCategory(message.categoria);
  const priority = PRIORIDAD_PRESENTATION[message.prioridad];
  const PriorityIcon = PRIORIDAD_ICON;

  function handlePriorityClick(e: React.MouseEvent) {
    // No confundir con un intento de arrastre: el botón de prioridad vive
    // dentro de la tarjeta arrastrable, así que para el evento aquí.
    e.stopPropagation();
    void updateTaskPriority(message.id, nextPriority(message.prioridad));
  }

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`fade-in touch-none rounded-xl border border-paper-line bg-paper-raised p-3 shadow-sm transition-shadow hover:shadow-md ${
        isDragging ? "z-10 opacity-50 shadow-lg" : ""
      }`}
    >
      <p className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${color}`}>
        <CategoryIcon aria-hidden size={13} />
        {presentCategory(message.categoria).label}
      </p>
      <p className="font-display text-sm leading-snug font-semibold text-ink">{message.resumen}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted">{message.contenido}</p>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-paper-line pt-2">
        <p className="flex items-center gap-1 text-xs text-muted">
          <Clock aria-hidden size={11} /> {formatDate(message.fecha)}
        </p>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handlePriorityClick}
          title="Cambiar prioridad"
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${priority.colorSoft} ${priority.color} hover:brightness-95 active:brightness-90`}
        >
          <PriorityIcon aria-hidden size={11} />
          {priority.label}
        </button>
      </div>
    </li>
  );
}
