"use client";

import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { Message, EstadoTarea } from "@prisma/client";
import type { BoardColumn } from "@/lib/data";
import { ESTADOS_TABLERO, nextEstado, nextPriority } from "@/lib/kanban";
import { updateTaskStatus, updateTaskPriority } from "@/app/(dashboard)/actions";
import type { EditableFields } from "@/components/MessageDetailDialog";
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

  function findMessage(messageId: string): Message | undefined {
    for (const estado of ESTADOS_TABLERO) {
      const found = byEstado[estado].find((m) => m.id === messageId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Único punto de actualización optimista del tablero: mueve la tarjeta de
   * columna si `patch.estado` cambia, o la actualiza en el sitio si no.
   * Usado por el arrastre, los botones de un clic (estado/prioridad) y el
   * modal de edición — todos comparten el mismo problema: `revalidatePath`
   * (en las Server Actions) no toca el estado de este Client Component ya
   * montado, así que sin esto la tarjeta no se movería/actualizaría hasta
   * un refresco de página entero.
   */
  function applyLocalUpdate(messageId: string, patch: Partial<Message>) {
    setByEstado((prev) => {
      const sourceEstado = (Object.keys(prev) as EstadoTarea[]).find((estado) =>
        prev[estado].some((m) => m.id === messageId),
      );
      if (!sourceEstado) return prev;

      const current = prev[sourceEstado].find((m) => m.id === messageId)!;
      const updated = { ...current, ...patch };
      const targetEstado = patch.estado ?? sourceEstado;

      if (targetEstado === sourceEstado) {
        return { ...prev, [sourceEstado]: prev[sourceEstado].map((m) => (m.id === messageId ? updated : m)) };
      }
      return {
        ...prev,
        [sourceEstado]: prev[sourceEstado].filter((m) => m.id !== messageId),
        [targetEstado]: [updated, ...prev[targetEstado]],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const targetEstado = String(over.id);
    if (!isEstadoTarea(targetEstado)) return;

    const messageId = String(active.id);
    const current = findMessage(messageId);
    if (!current || current.estado === targetEstado) return;

    const sourceEstado = current.estado;
    applyLocalUpdate(messageId, { estado: targetEstado, hecho: targetEstado === "HECHO" });

    updateTaskStatus(messageId, targetEstado).catch((err) => {
      console.error("No se pudo mover la tarjeta:", err);
      applyLocalUpdate(messageId, { estado: sourceEstado, hecho: sourceEstado === "HECHO" });
    });
  }

  function handleCycleEstado(messageId: string) {
    const current = findMessage(messageId);
    if (!current) return;
    const target = nextEstado(current.estado);

    applyLocalUpdate(messageId, { estado: target, hecho: target === "HECHO" });
    updateTaskStatus(messageId, target).catch((err) => {
      console.error("No se pudo cambiar el estado:", err);
      applyLocalUpdate(messageId, { estado: current.estado, hecho: current.hecho });
    });
  }

  function handleCyclePrioridad(messageId: string) {
    const current = findMessage(messageId);
    if (!current) return;
    const target = nextPriority(current.prioridad);

    applyLocalUpdate(messageId, { prioridad: target });
    updateTaskPriority(messageId, target).catch((err) => {
      console.error("No se pudo cambiar la prioridad:", err);
      applyLocalUpdate(messageId, { prioridad: current.prioridad });
    });
  }

  function handleSaved(messageId: string, patch: EditableFields) {
    applyLocalUpdate(messageId, patch);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 sm:flex-row sm:overflow-x-auto sm:pb-2">
        {ESTADOS_TABLERO.map((estado) => (
          <KanbanColumn
            key={estado}
            estado={estado}
            messages={byEstado[estado]}
            onCycleEstado={handleCycleEstado}
            onCyclePrioridad={handleCyclePrioridad}
            onSaved={handleSaved}
          />
        ))}
      </div>
    </DndContext>
  );
}
