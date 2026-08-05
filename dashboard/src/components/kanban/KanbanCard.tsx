"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Message } from "@prisma/client";
import { Clock } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { PRIORIDAD_PRESENTATION, PRIORIDAD_ICON, ESTADO_PRESENTATION } from "@/lib/kanban";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KanbanCardProps extends React.LiHTMLAttributes<HTMLLIElement> {
  message: Message;
  /**
   * El cambio de estado/prioridad de un clic lo decide `KanbanBoard` (no
   * esta tarjeta): solo así puede aplicar la misma actualización optimista
   * que ya usa el arrastre, moviendo la tarjeta de columna en el estado
   * local sin esperar a un refresco de página — `revalidatePath` por sí
   * solo no toca el estado de un Client Component ya montado.
   */
  onCycleEstado: (messageId: string) => void;
  onCyclePrioridad: (messageId: string) => void;
}

/**
 * `forwardRef` + spread de `...rest`: igual criterio que `MessageCard.tsx`
 * — `MessageDetailDialog` la usa como disparador (`DialogTrigger asChild`),
 * que necesita inyectar `onClick`/`ref` sin dejar de ser el `<li>`
 * arrastrable de dnd-kit.
 */
export const KanbanCard = React.forwardRef<HTMLLIElement, KanbanCardProps>(function KanbanCard(
  { message, onCycleEstado, onCyclePrioridad, className, ...rest },
  forwardedRef,
) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: message.id });
  const { Icon: CategoryIcon, color } = presentCategory(message.categoria);
  const priority = PRIORIDAD_PRESENTATION[message.prioridad];
  const PriorityIcon = PRIORIDAD_ICON;
  const EstadoIcon = ESTADO_PRESENTATION[message.estado].Icon;

  function setRefs(node: HTMLLIElement | null) {
    setNodeRef(node);
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  function handlePriorityClick(e: React.MouseEvent) {
    // No confundir con un intento de arrastre ni con abrir el modal de
    // detalle: los botones de acción viven dentro de la tarjeta
    // arrastrable/clicable, así que paran el evento aquí.
    e.stopPropagation();
    onCyclePrioridad(message.id);
  }

  function handleEstadoClick(e: React.MouseEvent) {
    e.stopPropagation();
    onCycleEstado(message.id);
  }

  /**
   * dnd-kit le da a la tarjeta `role="button"` y `tabIndex=0` (para que el
   * arrastre por PUNTERO sea anunciable), pero sin un `KeyboardSensor`
   * configurado eso deja un callejón sin salida real: un lector de
   * pantalla la anuncia como activable y Enter/Espacio no hacen nada.
   * En vez de añadir arrastre por teclado (más complejo y ya cubierto por
   * el botón "Cambiar estado" de abajo, que sí es un `<button>` normal),
   * se hace que Enter/Espacio en el CUERPO de la tarjeta abran el modal de
   * detalle — mismo destino que un clic, spread ya trae el `onClick` que
   * inyecta `DialogTrigger asChild`.
   */
  function handleCardKeyDown(e: React.KeyboardEvent<HTMLLIElement>) {
    if (e.target !== e.currentTarget) return; // no interceptar Enter/Espacio de los botones internos
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.currentTarget.click();
    }
  }

  return (
    <li
      ref={setRefs}
      {...listeners}
      {...attributes}
      {...rest}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        handleCardKeyDown(e);
      }}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "fade-in touch-none rounded-xl border border-paper-line bg-paper-raised p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging ? "z-10 opacity-50 shadow-lg" : "",
        className,
      )}
    >
      <p className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${color}`}>
        <CategoryIcon aria-hidden size={13} />
        {presentCategory(message.categoria).label}
      </p>
      <p className="font-display text-sm leading-snug font-semibold text-ink">{message.resumen}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted">{message.contenido}</p>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-paper-line pt-2">
        <p className="flex items-center gap-1 text-xs text-muted">
          <Clock aria-hidden size={11} /> {formatDate(message.fecha)}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleEstadoClick}
            title="Cambiar estado"
            aria-label={`Estado ${ESTADO_PRESENTATION[message.estado].label}. Cambiar.`}
            className="flex items-center gap-1 rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-ink transition-[filter] hover:brightness-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <EstadoIcon aria-hidden size={11} />
            {ESTADO_PRESENTATION[message.estado].label}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handlePriorityClick}
            title="Cambiar prioridad"
            aria-label={`Prioridad ${priority.label}. Cambiar.`}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-[filter] hover:brightness-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${priority.colorSoft} ${priority.color}`}
          >
            <PriorityIcon aria-hidden size={11} />
            {priority.label}
          </button>
        </div>
      </div>
    </li>
  );
});
