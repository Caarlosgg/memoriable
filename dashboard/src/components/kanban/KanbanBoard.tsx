"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import type { BoardColumn } from "@/lib/data";
import {
  ESTADOS_TABLERO,
  ESTADO_PRESENTATION,
  nextEstado,
  nextPriority,
  PRIORIDADES,
  PRIORIDAD_PRESENTATION,
} from "@/lib/kanban";
import { CATEGORIES, CATEGORY_PRESENTATION, presentCategory, type Category } from "@/lib/categories";
import { updateTaskStatus, updateTaskPriority, moveTask, updateMessage, assignMessage } from "@/app/(dashboard)/actions";
import type { WorkspaceMemberInfo } from "@/app/(dashboard)/equipo/actions";
import type { EditableFields } from "@/components/MessageDetailDialog";
import { cn } from "@/lib/utils";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardContent } from "./KanbanCard";
import { useKanbanDensity } from "./useKanbanDensity";

/** Mismas clases en ambos selects del filtro — un único sitio para que se vean iguales. */
const FILTER_CLASSNAME =
  "rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

/** Separación entre dos vecinas al insertar una tarjeta en un extremo (indexado fraccionario). */
const ORDEN_STEP = 1000;

function isEstadoTarea(value: string): value is EstadoTarea {
  return (ESTADOS_TABLERO as readonly string[]).includes(value);
}

type ByEstado = Record<EstadoTarea, Message[]>;

export function KanbanBoard({
  initialColumns,
  members = [],
}: {
  initialColumns: BoardColumn[];
  members?: WorkspaceMemberInfo[];
}) {
  const [byEstado, setByEstado] = useState<ByEstado>(
    () => Object.fromEntries(initialColumns.map((c) => [c.estado, c.messages])) as ByEstado,
  );
  const [density, setDensity] = useKanbanDensity();

  // Filtro visual (Fase F): no toca `byEstado` (los datos reales, con los
  // que trabajan drag/optimista), solo lo que se pasa a renderizar.
  const [filtroCategoria, setFiltroCategoria] = useState<Category | "todas">("todas");
  const [filtroPrioridad, setFiltroPrioridad] = useState<Prioridad | "todas">("todas");
  const hasFilters = filtroCategoria !== "todas" || filtroPrioridad !== "todas";

  // Borrado con margen de deshacer (Tier 1.3): igual que el filtro, no toca
  // `byEstado` — solo lo que se renderiza. Ver MessageDetailDialog.tsx.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  function handleDeleted(messageId: string) {
    setHiddenIds((prev) => new Set(prev).add(messageId));
  }
  function handleUndoDelete(messageId: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
  }

  // Anuncio para lectores de pantalla (Tier 1.4): el cambio visual del
  // botón "Cambiar estado/prioridad" ya lo ve quien usa el ratón, pero
  // alguien con lector de pantalla necesita un `aria-live` explícito —
  // los botones no navegan de sitio, así que el foco no se mueve solo.
  const [announcement, setAnnouncement] = useState("");

  function matchesFilter(message: Message): boolean {
    if (hiddenIds.has(message.id)) return false;
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

  function findContainer(id: string, state: ByEstado): EstadoTarea | undefined {
    if (isEstadoTarea(id)) return id;
    return (Object.keys(state) as EstadoTarea[]).find((estado) => state[estado].some((m) => m.id === id));
  }

  /**
   * Único punto de actualización optimista del tablero fuera del arrastre
   * (los botones de un clic estado/prioridad, y el modal de edición): mueve
   * la tarjeta de columna si `patch.estado` cambia (siempre arriba del
   * todo), o la actualiza en el sitio si no. `revalidatePath` (en las
   * Server Actions) no toca el estado de este Client Component ya montado,
   * así que sin esto la tarjeta no se movería/actualizaría hasta un
   * refresco de página entero. El arrastre en sí usa su propio flujo (ver
   * handleDragOver/handleDragEnd) porque necesita posición exacta, no solo
   * "arriba del todo".
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

  const [activeId, setActiveId] = useState<string | null>(null);
  // Foto del tablero justo antes de empezar a arrastrar: si el guardado en
  // el servidor falla, o el arrastre se cancela (Esc) a medio camino entre
  // columnas, se restaura tal cual estaba — sin esto, un fallo de red podía
  // dejar el tablero visualmente distinto de lo que de verdad hay guardado.
  const dragSnapshot = useRef<ByEstado | null>(null);

  function handleDragStart(event: DragStartEvent) {
    dragSnapshot.current = byEstado;
    setActiveId(String(event.active.id));
  }

  /**
   * Vista previa en vivo: si el puntero pasa a otra columna a mitad de
   * arrastre, la tarjeta ya se ve allí (patrón oficial de dnd-kit para
   * "sortable" con varios contenedores). Solo mueve ENTRE columnas — el
   * reordenado dentro de la misma columna se resuelve en handleDragEnd.
   */
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    setByEstado((prev) => {
      const activeContainer = findContainer(activeIdStr, prev);
      const overContainer = findContainer(overIdStr, prev);
      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex((m) => m.id === activeIdStr);
      const moving = activeItems[activeIndex];
      if (!moving) return prev;

      const overIndex = overItems.findIndex((m) => m.id === overIdStr);
      const newIndex = overIndex >= 0 ? overIndex : overItems.length;
      const updatedMoving = { ...moving, estado: overContainer, hecho: overContainer === "HECHO" };

      return {
        ...prev,
        [activeContainer]: activeItems.filter((m) => m.id !== activeIdStr),
        [overContainer]: [...overItems.slice(0, newIndex), updatedMoving, ...overItems.slice(newIndex)],
      };
    });
  }

  function handleDragCancel() {
    setActiveId(null);
    if (dragSnapshot.current) setByEstado(dragSnapshot.current);
    dragSnapshot.current = null;
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    const snapshot = dragSnapshot.current;
    dragSnapshot.current = null;
    if (!snapshot) return;
    if (!over) {
      // Soltada fuera de cualquier columna/tarjeta: no hay destino válido,
      // se restaura tal cual estaba antes de empezar a arrastrar.
      setByEstado(snapshot);
      return;
    }

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    setByEstado((prev) => {
      const container = findContainer(activeIdStr, prev);
      if (!container) return prev;

      const items = prev[container];
      const activeIndex = items.findIndex((m) => m.id === activeIdStr);
      const overIndex = isEstadoTarea(overIdStr) ? items.length - 1 : items.findIndex((m) => m.id === overIdStr);

      const reordered = overIndex >= 0 && activeIndex !== overIndex ? arrayMove(items, activeIndex, overIndex) : items;

      const finalIndex = reordered.findIndex((m) => m.id === activeIdStr);
      const above = reordered[finalIndex - 1];
      const below = reordered[finalIndex + 1];
      let newOrden: number;
      if (above && below) newOrden = (above.orden + below.orden) / 2;
      else if (above) newOrden = above.orden - ORDEN_STEP;
      else if (below) newOrden = below.orden + ORDEN_STEP;
      else newOrden = Date.now();

      const finalList = reordered.map((m) => (m.id === activeIdStr ? { ...m, orden: newOrden } : m));
      const original = findContainer(activeIdStr, snapshot);
      const originalMessage = original ? snapshot[original].find((m) => m.id === activeIdStr) : undefined;

      if (originalMessage?.estado !== container) {
        setAnnouncement(
          `«${originalMessage?.resumen ?? ""}» movida a ${ESTADO_PRESENTATION[container].label}.`,
        );
      }

      moveTask(activeIdStr, container, newOrden).catch((err) => {
        console.error("No se pudo mover la tarjeta:", err);
        setByEstado(snapshot);
      });

      return { ...prev, [container]: finalList };
    });
  }

  function handleCycleEstado(messageId: string) {
    const current = findMessage(messageId);
    if (!current) return;
    const target = nextEstado(current.estado);

    applyLocalUpdate(messageId, { estado: target, hecho: target === "HECHO" });
    setAnnouncement(`«${current.resumen}» ahora está ${ESTADO_PRESENTATION[target].label}.`);
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
    setAnnouncement(`«${current.resumen}» ahora tiene prioridad ${PRIORIDAD_PRESENTATION[target].label}.`);
    updateTaskPriority(messageId, target).catch((err) => {
      console.error("No se pudo cambiar la prioridad:", err);
      applyLocalUpdate(messageId, { prioridad: current.prioridad });
    });
  }

  function handleSaved(messageId: string, patch: EditableFields) {
    applyLocalUpdate(messageId, patch);
  }

  /**
   * Añadir una etiqueta directamente desde la tarjeta, sin abrir el modal
   * de detalle completo — reutiliza `updateMessage` (mismo Server Action
   * que el modal de edición usa para guardar `etiquetas`, entre otros
   * campos), no hace falta una acción dedicada.
   */
  function handleEtiquetaAdd(messageId: string, etiqueta: string) {
    const current = findMessage(messageId);
    if (!current || current.etiquetas.includes(etiqueta)) return;
    const etiquetas = [...current.etiquetas, etiqueta];
    applyLocalUpdate(messageId, { etiquetas });
    updateMessage(messageId, { etiquetas }).catch((err) => {
      console.error("No se pudo añadir la etiqueta:", err);
      applyLocalUpdate(messageId, { etiquetas: current.etiquetas });
    });
  }

  /**
   * Asignar/desasignar una tarjeta (Fase Equipo) — mismo patrón optimista
   * que el resto. `assignMessage` no lanza en el caso de validación (p. ej.
   * el destinatario dejó de ser miembro entre que se cargó la lista y el
   * clic) — devuelve `{ error }` en vez de rechazar, así que se comprueba
   * el resultado, no solo el catch.
   */
  function handleAssigneeChange(messageId: string, assigneeId: string | null) {
    const current = findMessage(messageId);
    if (!current) return;
    const previousAssigneeId = current.assigneeId;
    applyLocalUpdate(messageId, { assigneeId });
    assignMessage(messageId, assigneeId)
      .then((result) => {
        if (result.error) {
          console.error("No se pudo asignar la tarea:", result.error);
          applyLocalUpdate(messageId, { assigneeId: previousAssigneeId });
        }
      })
      .catch((err) => {
        console.error("No se pudo asignar la tarea:", err);
        applyLocalUpdate(messageId, { assigneeId: previousAssigneeId });
      });
  }

  const activeMessage = activeId ? findMessage(activeId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
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
        <button
          type="button"
          onClick={() => setDensity(density === "compacta" ? "normal" : "compacta")}
          aria-pressed={density === "compacta"}
          className="ml-auto rounded-full border border-paper-line bg-paper px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {density === "compacta" ? "Vista normal" : "Vista compacta"}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:overflow-x-auto sm:pb-2">
          {ESTADOS_TABLERO.map((estado) => (
            <KanbanColumn
              key={estado}
              estado={estado}
              messages={byEstado[estado].filter(matchesFilter)}
              density={density}
              members={members}
              onCycleEstado={handleCycleEstado}
              onCyclePrioridad={handleCyclePrioridad}
              onEtiquetaAdd={handleEtiquetaAdd}
              onAssigneeChange={handleAssigneeChange}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onUndoDelete={handleUndoDelete}
            />
          ))}
        </div>
        <DragOverlay>
          {activeMessage ? (
            <div
              className={cn(
                "rotate-2 rounded-xl border border-l-4 border-paper-line bg-paper-raised opacity-95 shadow-xl",
                density === "compacta" ? "p-2" : "p-3",
                presentCategory(activeMessage.categoria).borderAccent,
              )}
            >
              <KanbanCardContent message={activeMessage} density={density} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
