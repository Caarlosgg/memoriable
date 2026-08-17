"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  shouldClearEnProgreso,
} from "@/lib/kanban";
import { CATEGORIES, CATEGORY_PRESENTATION, presentCategory, type Category } from "@/lib/categories";
import { notifyEnProgresoChanged, TASK_PATCHED_ELSEWHERE_EVENT, type TaskPatchedElsewhereDetail } from "@/lib/enProgresoEvents";
import {
  updateTaskStatus,
  updateTaskPriority,
  moveTask,
  updateMessage,
  assignMessage,
  postponeMessage,
  startWorkingOn,
  stopWorkingOn,
  setBoardLabel,
} from "@/app/(dashboard)/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
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
  currentUserId,
  boardLabels: initialBoardLabels = {},
  canRenameColumns = false,
}: {
  initialColumns: BoardColumn[];
  members?: WorkspaceMemberInfo[];
  currentUserId: string;
  /** Nombres personalizados de columna por workspace (ver Workspace.boardLabels) — ausente = etiqueta por defecto. */
  boardLabels?: Partial<Record<EstadoTarea, string>>;
  /** VIEWER no puede renombrar columnas — mismo permiso que crear/editar contenido (`canWrite`). */
  canRenameColumns?: boolean;
}) {
  const [byEstado, setByEstado] = useState<ByEstado>(
    () => Object.fromEntries(initialColumns.map((c) => [c.estado, c.messages])) as ByEstado,
  );
  const [density, setDensity] = useKanbanDensity();
  const [boardLabels, setBoardLabels] = useState(initialBoardLabels);

  const handleRenameColumn = useCallback((estado: EstadoTarea, nombre: string | null) => {
    const previous = boardLabels[estado];
    setBoardLabels((prev) => {
      const next = { ...prev };
      if (nombre) next[estado] = nombre;
      else delete next[estado];
      return next;
    });
    setBoardLabel(estado, nombre).catch((err) => {
      console.error("No se pudo renombrar la columna:", err);
      setBoardLabels((prev) => ({ ...prev, [estado]: previous }));
    });
  }, [boardLabels]);

  // Filtro visual (Fase F): no toca `byEstado` (los datos reales, con los
  // que trabajan drag/optimista), solo lo que se pasa a renderizar.
  const [filtroCategoria, setFiltroCategoria] = useState<Category | "todas">("todas");
  const [filtroPrioridad, setFiltroPrioridad] = useState<Prioridad | "todas">("todas");
  // "todas" | "sin-asignar" | un userId — solo tiene sentido en modo equipo
  // (con `members`), ver el <select> condicional más abajo.
  const [filtroAsignado, setFiltroAsignado] = useState<string>("todas");
  const hasFilters = filtroCategoria !== "todas" || filtroPrioridad !== "todas" || filtroAsignado !== "todas";

  // Borrado con margen de deshacer (Tier 1.3): igual que el filtro, no toca
  // `byEstado` — solo lo que se renderiza. Ver MessageDetailDialog.tsx.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const handleDeleted = useCallback((messageId: string) => {
    setHiddenIds((prev) => new Set(prev).add(messageId));
  }, []);
  const handleUndoDelete = useCallback((messageId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
  }, []);

  // Anuncio para lectores de pantalla (Tier 1.4): el cambio visual del
  // botón "Cambiar estado/prioridad" ya lo ve quien usa el ratón, pero
  // alguien con lector de pantalla necesita un `aria-live` explícito —
  // los botones no navegan de sitio, así que el foco no se mueve solo.
  const [announcement, setAnnouncement] = useState("");

  // Distancia mínima antes de considerarlo arrastre: sin esto, un tap normal
  // en móvil (o un click) se interpretaría como el inicio de un drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // `findMessage` lee de esta ref (siempre al día vía el efecto de abajo)
  // en vez de cerrar sobre `byEstado` directamente — así los handlers que
  // la usan (handleCycleEstado, handleCyclePrioridad...) pueden ir en
  // `useCallback` con deps vacías (identidad estable entre renders) sin
  // quedarse con una versión obsoleta de `byEstado`. Sin esto, cada
  // render de KanbanBoard (p. ej. cada evento de arrastre) recreaba estos
  // handlers, lo que a su vez rompía el `memo` de KanbanColumn/KanbanCard
  // — la columna entera se re-renderizaba aunque sus propias tarjetas no
  // hubieran cambiado.
  const byEstadoRef = useRef(byEstado);
  useEffect(() => {
    byEstadoRef.current = byEstado;
  }, [byEstado]);

  function findInState(state: ByEstado, messageId: string): Message | undefined {
    for (const estado of ESTADOS_TABLERO) {
      const found = state[estado].find((m) => m.id === messageId);
      if (found) return found;
    }
    return undefined;
  }

  // Solo para usar DENTRO de handlers/efectos, nunca durante el render:
  // leer un ref en el cuerpo del componente rompe la regla de refs de
  // React (el valor podría no reflejar el commit que se está pintando).
  // Para el render (p. ej. `activeMessage` más abajo) se usa
  // `findInState(byEstado, id)` directamente, con el estado de verdad.
  // `useCallback` con deps vacías: solo toca la ref (siempre al día por
  // definición), así que su propia identidad puede ser estable para
  // siempre — eso permite listarla sin problema como dependencia de los
  // handlers de abajo sin que eso los obligue a recrearse en cada render.
  const findMessage = useCallback((messageId: string): Message | undefined => {
    return findInState(byEstadoRef.current, messageId);
  }, []);

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

  // `CurrentTaskBar` vive en el layout, fuera de este componente — cuando
  // marca hecha o suelta TU tarjeta activa desde ahí, esta es la única
  // forma de que este tablero ya montado se entere sin esperar a un
  // refresco de página (ver el comentario en lib/enProgresoEvents.ts).
  useEffect(() => {
    function onPatchedElsewhere(e: Event) {
      const { messageId, patch } = (e as CustomEvent<TaskPatchedElsewhereDetail>).detail;
      applyLocalUpdate(messageId, patch);
    }
    window.addEventListener(TASK_PATCHED_ELSEWHERE_EVENT, onPatchedElsewhere);
    return () => window.removeEventListener(TASK_PATCHED_ELSEWHERE_EVENT, onPatchedElsewhere);
  }, []);

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

    // Todo el cálculo es puro y se hace ANTES de tocar el estado — antes,
    // `moveTask` (Server Action) y `setAnnouncement` se llamaban DENTRO
    // de la función de actualización pasada a `setByEstado`. React puede
    // invocar esa función más de una vez (p. ej. en Strict Mode, en
    // desarrollo), y hacerlo disparaba dos peticiones de red duplicadas
    // por cada tarjeta arrastrada — verificado en vivo, se veían dos
    // llamadas a `moveTask` seguidas por el mismo arrastre. Ahora
    // `setByEstado` recibe una función pura de verdad (solo calcula y
    // devuelve el nuevo estado) y los efectos secundarios van aparte,
    // una sola vez.
    const prevState = byEstadoRef.current;
    const container = findContainer(activeIdStr, prevState);
    if (!container) return;

    const items = prevState[container];
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

    // Igual que en el servidor (ver `shouldClearEnProgreso`): soltarla en
    // HECHO también suelta "en curso ahora".
    const clearsEnProgreso = shouldClearEnProgreso(container);
    const finalList = reordered.map((m) =>
      m.id === activeIdStr
        ? { ...m, orden: newOrden, ...(clearsEnProgreso ? { enProgresoPorId: null, enProgresoDesde: null } : {}) }
        : m,
    );
    const original = findContainer(activeIdStr, snapshot);
    const originalMessage = original ? snapshot[original].find((m) => m.id === activeIdStr) : undefined;

    setByEstado((current) => ({ ...current, [container]: finalList }));

    if (originalMessage?.estado !== container) {
      setAnnouncement(`«${originalMessage?.resumen ?? ""}» movida a ${ESTADO_PRESENTATION[container].label}.`);
    }

    moveTask(activeIdStr, container, newOrden)
      .then(() => {
        if (clearsEnProgreso) notifyEnProgresoChanged();
      })
      .catch((err) => {
        console.error("No se pudo mover la tarjeta:", err);
        setByEstado(snapshot);
      });
  }

  // Las cinco de abajo van en `useCallback` con deps vacías (identidad
  // estable entre renders de KanbanBoard) — ver el comentario junto a
  // `byEstadoRef` más arriba para el porqué. Todas leen datos "actuales"
  // vía `findMessage` (que ya lee de la ref) o vía el propio parámetro del
  // evento, nunca cierran sobre `byEstado` directamente.
  const handleCycleEstado = useCallback((messageId: string) => {
    const current = findMessage(messageId);
    if (!current) return;
    const target = nextEstado(current.estado);
    // Igual que en el servidor (ver `shouldClearEnProgreso`): marcarla
    // HECHA suelta también "en curso ahora" — no tendría sentido que
    // siguiera apareciendo como que alguien la está haciendo.
    const clearsEnProgreso = shouldClearEnProgreso(target);
    const clearEnProgreso = clearsEnProgreso ? { enProgresoPorId: null, enProgresoDesde: null } : {};

    applyLocalUpdate(messageId, { estado: target, hecho: target === "HECHO", ...clearEnProgreso });
    setAnnouncement(`«${current.resumen}» ahora está ${ESTADO_PRESENTATION[target].label}.`);
    updateTaskStatus(messageId, target)
      .then(() => {
        // Se avisa DESPUÉS de que el servidor confirme, no antes: `CurrentTaskBar`
        // reacciona a este evento releyendo del servidor, y si avisara antes,
        // podría releer justo antes de que el propio cambio se hubiera guardado.
        if (clearsEnProgreso) notifyEnProgresoChanged();
      })
      .catch((err) => {
        console.error("No se pudo cambiar el estado:", err);
        applyLocalUpdate(messageId, { estado: current.estado, hecho: current.hecho });
      });
  }, [findMessage]);

  const handleCyclePrioridad = useCallback((messageId: string) => {
    const current = findMessage(messageId);
    if (!current) return;
    const target = nextPriority(current.prioridad);

    applyLocalUpdate(messageId, { prioridad: target });
    setAnnouncement(`«${current.resumen}» ahora tiene prioridad ${PRIORIDAD_PRESENTATION[target].label}.`);
    updateTaskPriority(messageId, target).catch((err) => {
      console.error("No se pudo cambiar la prioridad:", err);
      applyLocalUpdate(messageId, { prioridad: current.prioridad });
    });
  }, [findMessage]);

  // Guardar desde el modal de edición es la TERCERA vía por la que una
  // tarjeta puede llegar a HECHA (o a una categoría no accionable) —
  // arrastre y el botón "Cambiar estado" ya limpiaban "en curso ahora"
  // localmente, pero este camino se había quedado sin ello (verificado en
  // revisión de código: la tarjeta seguía mostrando "Trabajando…" tras
  // guardar HECHA desde el modal, hasta recargar la página).
  const handleSaved = useCallback((messageId: string, patch: EditableFields) => {
    const clearsEnProgreso = shouldClearEnProgreso(patch.estado, patch.categoria);
    applyLocalUpdate(messageId, {
      ...patch,
      ...(clearsEnProgreso ? { enProgresoPorId: null, enProgresoDesde: null } : {}),
    });
    if (clearsEnProgreso) notifyEnProgresoChanged();
  }, []);

  /**
   * Añadir una etiqueta directamente desde la tarjeta, sin abrir el modal
   * de detalle completo — reutiliza `updateMessage` (mismo Server Action
   * que el modal de edición usa para guardar `etiquetas`, entre otros
   * campos), no hace falta una acción dedicada.
   */
  const handleEtiquetaAdd = useCallback((messageId: string, etiqueta: string) => {
    const current = findMessage(messageId);
    if (!current || current.etiquetas.includes(etiqueta)) return;
    const etiquetas = [...current.etiquetas, etiqueta];
    applyLocalUpdate(messageId, { etiquetas });
    updateMessage(messageId, { etiquetas }).catch((err) => {
      console.error("No se pudo añadir la etiqueta:", err);
      applyLocalUpdate(messageId, { etiquetas: current.etiquetas });
    });
  }, [findMessage]);

  /**
   * Asignar/desasignar una tarjeta (Fase Equipo) — mismo patrón optimista
   * que el resto. `assignMessage` no lanza en el caso de validación (p. ej.
   * el destinatario dejó de ser miembro entre que se cargó la lista y el
   * clic) — devuelve `{ error }` en vez de rechazar, así que se comprueba
   * el resultado, no solo el catch.
   */
  const handleAssigneeChange = useCallback((messageId: string, assigneeId: string | null) => {
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
  }, [findMessage]);

  /**
   * Aplazar (o quitar, con `fechaLimite: null`) la fecha límite — mismo
   * patrón optimista que el resto: aplica en local primero, y si
   * `postponeMessage` falla, se revierte.
   */
  const handlePostpone = useCallback((messageId: string, fechaLimite: Date | null) => {
    const current = findMessage(messageId);
    if (!current) return;
    const previousFechaLimite = current.fechaLimite;
    applyLocalUpdate(messageId, { fechaLimite });
    postponeMessage(messageId, fechaLimite).catch((err) => {
      console.error("No se pudo aplazar la tarea:", err);
      applyLocalUpdate(messageId, { fechaLimite: previousFechaLimite });
    });
  }, [findMessage]);

  /**
   * "Empezar"/"soltar" una tarjeta (Fase "en curso ahora"): empezarla
   * también la mueve a EN_PROGRESO local, igual que hace `startWorkingOn`
   * en el servidor — mismo criterio optimista que el resto.
   */
  const handleStartWorking = useCallback((messageId: string) => {
    const current = findMessage(messageId);
    if (!current) return;
    const previous = { enProgresoPorId: current.enProgresoPorId, enProgresoDesde: current.enProgresoDesde, estado: current.estado };
    applyLocalUpdate(messageId, { enProgresoPorId: currentUserId, enProgresoDesde: new Date(), estado: "EN_PROGRESO" });
    // Se avisa DESPUÉS de que el servidor confirme (no antes): `CurrentTaskBar`
    // relee del servidor al recibir este evento, y avisar antes se arriesgaba a
    // releer justo antes de que la propia escritura se hubiera guardado —
    // verificado en vivo (la barra no recogía el cambio recién hecho).
    startWorkingOn(messageId)
      .then(() => notifyEnProgresoChanged())
      .catch((err) => {
        console.error("No se pudo empezar la tarea:", err);
        applyLocalUpdate(messageId, previous);
        notifyEnProgresoChanged();
      });
  }, [findMessage, currentUserId]);

  const handleStopWorking = useCallback((messageId: string) => {
    const current = findMessage(messageId);
    if (!current) return;
    const previous = { enProgresoPorId: current.enProgresoPorId, enProgresoDesde: current.enProgresoDesde };
    applyLocalUpdate(messageId, { enProgresoPorId: null, enProgresoDesde: null });
    stopWorkingOn(messageId)
      .then(() => notifyEnProgresoChanged())
      .catch((err) => {
        console.error("No se pudo soltar la tarea:", err);
        applyLocalUpdate(messageId, previous);
        notifyEnProgresoChanged();
      });
  }, [findMessage]);

  const activeMessage = activeId ? findInState(byEstado, activeId) : undefined;
  const hasAnyMessages = ESTADOS_TABLERO.some((estado) => byEstado[estado].length > 0);

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
        {members.length > 0 && (
          <select
            value={filtroAsignado}
            onChange={(e) => setFiltroAsignado(e.target.value)}
            aria-label="Filtrar el tablero por persona asignada"
            className={FILTER_CLASSNAME}
          >
            <option value="todas">Cualquier persona</option>
            <option value="sin-asignar">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.email}
              </option>
            ))}
          </select>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFiltroCategoria("todas");
              setFiltroPrioridad("todas");
              setFiltroAsignado("todas");
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

      {!hasFilters && !hasAnyMessages ? (
        <div className="rounded-xl border border-dashed border-paper-line bg-paper-raised/60 p-8 text-center">
          <p className="text-muted">
            Todavía no hay ninguna tarea. Escríbele algo al bot de Telegram (o pídeselo al Asistente) y aparecerá
            aquí, categorizada y lista para organizar.
          </p>
        </div>
      ) : (
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
                messages={byEstado[estado]}
                density={density}
                members={members}
                currentUserId={currentUserId}
                filtroCategoria={filtroCategoria}
                filtroPrioridad={filtroPrioridad}
                filtroAsignado={filtroAsignado}
                hiddenIds={hiddenIds}
                onCycleEstado={handleCycleEstado}
                onCyclePrioridad={handleCyclePrioridad}
                onEtiquetaAdd={handleEtiquetaAdd}
                onAssigneeChange={handleAssigneeChange}
                onPostpone={handlePostpone}
                onStartWorking={handleStartWorking}
                onStopWorking={handleStopWorking}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                onUndoDelete={handleUndoDelete}
                label={boardLabels[estado]}
                canRename={canRenameColumns}
                onRename={handleRenameColumn}
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
      )}
    </div>
  );
}
