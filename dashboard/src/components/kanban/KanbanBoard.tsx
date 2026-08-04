"use client";

import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { Message, EstadoTarea } from "@prisma/client";
import type { BoardColumn } from "@/lib/data";
import { ESTADOS_TABLERO } from "@/lib/kanban";
import { updateTaskStatus } from "@/app/(dashboard)/actions";
import { KanbanColumn } from "./KanbanColumn";

function isEstadoTarea(value: string): value is EstadoTarea {
  return (ESTADOS_TABLERO as readonly string[]).includes(value);
}

export function KanbanBoard({ initialColumns }: { initialColumns: BoardColumn[] }) {
  const [byEstado, setByEstado] = useState<Record<EstadoTarea, Message[]>>(() =>
    Object.fromEntries(initialColumns.map((c) => [c.estado, c.messages])) as Record<EstadoTarea, Message[]>,
  );

  // Distancia mínima antes de considerarlo arrastre: sin esto, un tap normal
  // en móvil (o un click) se interpretaría como el inicio de un drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const targetEstado = String(over.id);
    if (!isEstadoTarea(targetEstado)) return;

    const messageId = String(active.id);
    const sourceEstado = (Object.keys(byEstado) as EstadoTarea[]).find((estado) =>
      byEstado[estado].some((m) => m.id === messageId),
    );
    if (!sourceEstado || sourceEstado === targetEstado) return;

    const message = byEstado[sourceEstado].find((m) => m.id === messageId);
    if (!message) return;

    // Optimista: se mueve ya en pantalla. Si falla la escritura, se revierte.
    setByEstado((prev) => ({
      ...prev,
      [sourceEstado]: prev[sourceEstado].filter((m) => m.id !== messageId),
      [targetEstado]: [{ ...message, estado: targetEstado }, ...prev[targetEstado]],
    }));

    updateTaskStatus(messageId, targetEstado).catch((err) => {
      console.error("No se pudo mover la tarjeta:", err);
      setByEstado((prev) => ({
        ...prev,
        [targetEstado]: prev[targetEstado].filter((m) => m.id !== messageId),
        [sourceEstado]: [message, ...prev[sourceEstado]],
      }));
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 sm:flex-row sm:overflow-x-auto sm:pb-2">
        {ESTADOS_TABLERO.map((estado) => (
          <KanbanColumn key={estado} estado={estado} messages={byEstado[estado]} />
        ))}
      </div>
    </DndContext>
  );
}
