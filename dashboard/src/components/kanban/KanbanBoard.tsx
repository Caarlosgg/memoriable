"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import type { BoardColumn } from "@/lib/data";
import { ESTADOS_TABLERO, nextEstado, nextPriority, PRIORIDADES, PRIORIDAD_PRESENTATION } from "@/lib/kanban";
import { CATEGORIES, CATEGORY_PRESENTATION, type Category } from "@/lib/categories";
import { updateTaskStatus, updateTaskPriority, saveBoardFilters } from "@/app/(dashboard)/actions";
import type { EditableFields } from "@/components/MessageDetailDialog";
import { KanbanColumn } from "./KanbanColumn";

/** Espera de inactividad antes de persistir el filtro — evita una escritura por cada clic si cambian ambos selects seguidos. */
const FILTER_SAVE_DEBOUNCE_MS = 600;

/** Mismas clases en ambos selects del filtro — un único sitio para que se vean iguales. */
const FILTER_CLASSNAME =
  "rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

function isEstadoTarea(value: string): value is EstadoTarea {
  return (ESTADOS_TABLERO as readonly string[]).includes(value);
}

export function KanbanBoard({
  initialColumns,
  initialFiltroCategoria,
  initialFiltroPrioridad,
}: {
  initialColumns: BoardColumn[];
  /** Último filtro guardado para este usuario (Fase A2) — recordado entre sesiones/dispositivos, no solo en este navegador. */
  initialFiltroCategoria?: Category;
  initialFiltroPrioridad?: Prioridad;
}) {
  const [byEstado, setByEstado] = useState<Record<EstadoTarea, Message[]>>(() =>
    Object.fromEntries(initialColumns.map((c) => [c.estado, c.messages])) as Record<EstadoTarea, Message[]>,
  );
  // Filtro visual (Fase F): no toca `byEstado` (los datos reales, con los
  // que trabajan drag/optimista), solo lo que se pasa a renderizar.
  const [filtroCategoria, setFiltroCategoria] = useState<Category | "todas">(initialFiltroCategoria ?? "todas");
  const [filtroPrioridad, setFiltroPrioridad] = useState<Prioridad | "todas">(initialFiltroPrioridad ?? "todas");
  const hasFilters = filtroCategoria !== "todas" || filtroPrioridad !== "todas";

  // No persiste en el primer render (evita reescribir lo que ya vino del
  // servidor) — solo cuando el usuario de verdad cambia un filtro.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      saveBoardFilters({
        categoria: filtroCategoria === "todas" ? undefined : filtroCategoria,
        prioridad: filtroPrioridad === "todas" ? undefined : filtroPrioridad,
      }).catch((err) => console.error("No se pudo guardar el filtro del tablero:", err));
    }, FILTER_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [filtroCategoria, filtroPrioridad]);

  function matchesFilter(message: Message): boolean {
    if (filtroCategoria !== "todas" && message.categoria !== filtroCategoria) return false;
    if (filtroPrioridad !== "todas" && message.prioridad !== filtroPrioridad) return false;
    return true;
  }

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value as Category | "todas")}
          aria-label="Filtrar el tablero por categoría"
          className={FILTER_CLASSNAME}
        >
          <option value="todas">Cualquier categoría</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_PRESENTATION[c].label}
            </option>
          ))}
        </select>
        <select
          value={filtroPrioridad}
          onChange={(e) => setFiltroPrioridad(e.target.value as Prioridad | "todas")}
          aria-label="Filtrar el tablero por prioridad"
          className={FILTER_CLASSNAME}
        >
          <option value="todas">Cualquier prioridad</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {PRIORIDAD_PRESENTATION[p].label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFiltroCategoria("todas");
              setFiltroPrioridad("todas");
            }}
            className="text-xs font-medium text-muted underline-offset-2 hover:text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-4 sm:flex-row sm:overflow-x-auto sm:pb-2">
          {ESTADOS_TABLERO.map((estado) => (
            <KanbanColumn
              key={estado}
              estado={estado}
              messages={byEstado[estado].filter(matchesFilter)}
              onCycleEstado={handleCycleEstado}
              onCyclePrioridad={handleCyclePrioridad}
              onSaved={handleSaved}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
