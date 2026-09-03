"use client";

import type { ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

/** Prefijo del id de una casilla de día, para distinguirla de un evento en `onDragEnd`. */
export const DIA_DROP_PREFIX = "dia:";

/**
 * Un evento que se puede arrastrar a otro día.
 *
 * El calendario no tenía NINGÚN arrastre: mover una reunión al día
 * siguiente obligaba a abrir su ficha, editar la fecha y guardar, para algo
 * que en cualquier calendario es tirar de la tarjeta. El backend
 * (`moverEvento`) ya estaba; solo faltaba el gesto.
 *
 * `activationConstraint` (en el DndContext) es lo que permite que el chip
 * siga siendo un BOTÓN que abre el detalle: sin una distancia mínima antes
 * de considerar que se está arrastrando, cada clic se interpretaría como el
 * comienzo de un arrastre y no se podría abrir nada.
 */
export function DraggableEvento({
  id,
  disabled,
  children,
}: {
  id: string;
  /** En modo solo lectura no se arrastra: el servidor lo rechazaría igual, pero dejar arrastrar y luego revertir es peor que no dejar. */
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "touch-none",
        // Se atenúa en vez de desaparecer: ver de dónde sale la tarjeta
        // mientras se arrastra ayuda a saber qué se está moviendo.
        isDragging && "opacity-40",
        !disabled && "cursor-grab active:cursor-grabbing",
      )}
    >
      {children}
    </div>
  );
}

/** Casilla de día que acepta eventos soltados encima. */
export function DiaDroppable({
  fechaKey,
  children,
  className,
}: {
  fechaKey: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DIA_DROP_PREFIX}${fechaKey}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "ring-2 ring-accent ring-offset-1 ring-offset-paper")}
    >
      {children}
    </div>
  );
}
