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
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import type { BoardColumn } from "@/lib/data";
import {
  nextPriority,
  PRIORIDADES,
  PRIORIDAD_PRESENTATION,
  shouldClearEnProgreso,
  VISTAS_TABLERO,
  VISTA_LABEL,
  type VistaTablero,
} from "@/lib/kanban";
import {
  CATEGORIES,
  CATEGORY_PRESENTATION,
  presentCategory,
  type Category,
} from "@/lib/categories";
import {
  columnaDeTarjeta,
  columnaDeDragId,
  faseDeColumna,
  COLUMN_DRAG_PREFIX,
  type ColumnaTablero,
} from "@/lib/boardColumns";
import {
  notifyEnProgresoChanged,
  TASK_PATCHED_ELSEWHERE_EVENT,
  type TaskPatchedElsewhereDetail,
} from "@/lib/enProgresoEvents";
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
import { reorderBoardColumns } from "@/app/(dashboard)/columnas/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import type { EditableFields } from "@/components/MessageDetailDialog";
import { cn } from "@/lib/utils";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardContent } from "./KanbanCard";
import { useKanbanDensity } from "./useKanbanDensity";
import { GestionColumnasDialog } from "./GestionColumnasDialog";
import { Select } from "@/components/ui/select";

/** Mismas clases en ambos selects del filtro — un único sitio para que se vean iguales. */
/** Separación entre dos vecinas al insertar una tarjeta en un extremo (indexado fraccionario). */
const ORDEN_STEP = 1000;

/**
 * Referencia estable para una columna sin tarjetas. Un `[]` nuevo en cada
 * render rompería el `memo` de KanbanColumn (ver su comentario): la prop
 * `messages` nunca sería `===` a la anterior.
 */
const EMPTY_LIST: Message[] = [];

/**
 * Tarjetas por COLUMNA (su id), no por valor del enum: con columnas
 * propias puede haber varias columnas de la misma fase (p. ej. "En
 * diseño" y "En revisión", las dos EN_PROGRESO), así que el enum ya no
 * sirve de clave. Ver boardColumns.ts.
 */
type ByColumna = Record<string, Message[]>;

export function KanbanBoard({
  initialColumns,
  columnas,
  members = [],
  currentUserId,
  boardLabels: initialBoardLabels = {},
  puedeEditar = false,
  vistaInicial = "todas",
  asignadoInicial,
}: {
  initialColumns: BoardColumn[];
  /** Columnas efectivas del workspace (propias o las tres de siempre) — ver resolverColumnas. */
  columnas: ColumnaTablero[];
  members?: WorkspaceMemberInfo[];
  currentUserId: string;
  /** Nombres personalizados de columna por workspace (ver Workspace.boardLabels) — ausente = etiqueta por defecto. */
  boardLabels?: Partial<Record<EstadoTarea, string>>;
  /** `canWrite(role)`: VIEWER ve el tablero pero no lo toca — ni crea tarjetas, ni renombra o gestiona columnas. */
  puedeEditar?: boolean;
  /** Vista rápida pedida por URL (`/pendientes?vista=`) — ver parseVista en lib/kanban.ts. */
  vistaInicial?: VistaTablero;
  /** Persona pedida por URL (`/pendientes?asignado=`), ya validada en BoardSection — la usa el reparto de trabajo de /equipo. */
  asignadoInicial?: string;
}) {
  const [byEstado, setByEstado] = useState<ByColumna>(() =>
    Object.fromEntries(initialColumns.map((c) => [c.columnaId, c.messages])),
  );

  /**
   * Total real por columna cuando el servidor recortó la lista. NO va en
   * estado: es un dato del servidor que no se toca de forma optimista —
   * mover una tarjeta no cambia cuántas hay en total en "Hecho" de una
   * manera que merezca la pena predecir aquí.
   */
  const totalPorColumna = Object.fromEntries(
    initialColumns.flatMap((c) => (c.totalReal ? [[c.columnaId, c.totalReal] as const] : [])),
  );

  /**
   * Resincroniza las tarjetas cuando el servidor manda un JUEGO DE COLUMNAS
   * distinto.
   *
   * `useState` con inicializador solo corre en el primer render, así que
   * `byEstado` se quedaba con las claves de las columnas viejas para
   * siempre. El caso grave es crear la PRIMERA columna propia: ahí
   * `resolverColumnas` deja de devolver las tres por defecto (cuyo id es el
   * valor del enum, "POR_HACER") y pasa a devolver filas de `BoardStatus`
   * (cuyo id es un cuid), o sea que cambian TODOS los ids a la vez —
   * ninguna tarjeta encontraba su columna y el tablero entero se quedaba en
   * blanco hasta recargar a mano.
   *
   * Es el patrón que documenta React para ajustar estado cuando cambia una
   * prop: comparar contra el valor anterior DURANTE el render, no en un
   * efecto (que además provocaría un render de más y choca con la regla
   * `react-hooks/set-state-in-effect` del proyecto).
   *
   * Compara solo los IDS a propósito: rehacer esto ante cualquier cambio de
   * mensajes pisaría los movimientos optimistas que todavía están en vuelo,
   * que es justo lo que `byEstado` existe para sostener.
   */
  const firmaColumnas = initialColumns.map((c) => c.columnaId).join("|");
  const [firmaPrevia, setFirmaPrevia] = useState(firmaColumnas);
  if (firmaColumnas !== firmaPrevia) {
    setFirmaPrevia(firmaColumnas);
    setByEstado(
      Object.fromEntries(initialColumns.map((c) => [c.columnaId, c.messages])),
    );
  }
  /**
   * Orden de las columnas, en local, para que arrastrar una se vea al
   * instante en vez de esperar a que vuelva el servidor. Se resincroniza
   * con la misma comparación de firma que `byEstado` justo arriba, y por
   * el mismo motivo.
   *
   * Solo se pueden reordenar cuando TODAS son propias del workspace: las
   * tres por defecto no son filas en la base de datos (su id es el valor
   * del enum), así que no hay ningún `orden` que guardarles. En cuanto se
   * crea la primera columna propia se materializan las tres (ver
   * createBoardColumn) y a partir de ahí ya se pueden mover todas.
   */
  const firmaOrden = columnas.map((c) => c.id).join(" ");
  const [columnasLocales, setColumnasLocales] = useState(columnas);
  const [firmaOrdenPrevia, setFirmaOrdenPrevia] = useState(firmaOrden);
  if (firmaOrden !== firmaOrdenPrevia) {
    setFirmaOrdenPrevia(firmaOrden);
    setColumnasLocales(columnas);
  }
  const puedeReordenar =
    puedeEditar &&
    columnasLocales.length > 1 &&
    columnasLocales.every((c) => c.esPersonalizada);

  /** ¿Es este id el de una columna (y no el de una tarjeta)? Lo usa el arrastre. */
  const esColumna = useCallback(
    (id: string) => columnas.some((c) => c.id === id),
    [columnas],
  );
  /**
   * ¿Es una columna PROPIA del workspace? Solo esas se guardan en
   * `boardStatusId`; en las tres por defecto (cuyo id es el valor del enum)
   * el campo va a null, que es como han estado siempre las tarjetas.
   */
  const esColumnaPropia = useCallback(
    (id: string) => columnas.some((c) => c.id === id && c.esPersonalizada),
    [columnas],
  );
  const [density, setDensity] = useKanbanDensity();
  const [boardLabels, setBoardLabels] = useState(initialBoardLabels);

  const handleRenameColumn = useCallback(
    (estado: EstadoTarea, nombre: string | null) => {
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
    },
    [boardLabels],
  );

  // Filtro visual (Fase F): no toca `byEstado` (los datos reales, con los
  // que trabajan drag/optimista), solo lo que se pasa a renderizar.
  const [filtroCategoria, setFiltroCategoria] = useState<Category | "todas">(
    "todas",
  );
  const [filtroPrioridad, setFiltroPrioridad] = useState<Prioridad | "todas">(
    "todas",
  );
  // "todas" | "sin-asignar" | un userId — solo tiene sentido en modo equipo
  // (con `members`), ver el <Select> condicional más abajo.
  const [filtroAsignado, setFiltroAsignado] = useState<string>(
    asignadoInicial ?? "todas",
  );
  // Vista rápida: llega por URL desde las cifras de Inicio, pero después es
  // estado normal del tablero (se puede cambiar y quitar aquí mismo, sin
  // volver a navegar).
  const [vista, setVista] = useState<VistaTablero>(vistaInicial);
  const hasFilters =
    filtroCategoria !== "todas" ||
    filtroPrioridad !== "todas" ||
    filtroAsignado !== "todas" ||
    vista !== "todas";

  // Borrado con margen de deshacer (Tier 1.3): igual que el filtro, no toca
  // `byEstado` — solo lo que se renderiza. Ver MessageDetailDialog.tsx.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const handleDeleted = useCallback((messageId: string) => {
    setHiddenIds((prev) => new Set(prev).add(messageId));
  }, []);
  /**
   * Tarjeta recién creada desde una columna: entra arriba del todo de esa
   * columna, sin recargar. Va por `columnaDeTarjeta` y no por la columna
   * donde se pulsó "+": si el pipeline la categorizó como algo que no es
   * accionable, o el servidor la colocó en otro sitio, manda lo que de
   * verdad se guardó.
   */
  const handleCreated = useCallback(
    (message: Message) => {
      setByEstado((prev) => {
        const destino = columnaDeTarjeta(message, columnas);
        if (!(destino in prev)) return prev;
        return { ...prev, [destino]: [message, ...(prev[destino] ?? [])] };
      });
    },
    [columnas],
  );

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

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

  function findInState(
    state: ByColumna,
    messageId: string,
  ): Message | undefined {
    for (const lista of Object.values(state)) {
      const found = lista.find((m) => m.id === messageId);
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

  function findContainer(id: string, state: ByColumna): string | undefined {
    if (esColumna(id)) return id;
    return Object.keys(state).find((columnaId) =>
      state[columnaId]?.some((m) => m.id === id),
    );
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
  const applyLocalUpdate = useCallback(
    (messageId: string, patch: Partial<Message>) => {
      setByEstado((prev) => {
        const origen = Object.keys(prev).find((columnaId) =>
          prev[columnaId]?.some((m) => m.id === messageId),
        );
        if (!origen) return prev;

        const current = prev[origen]!.find((m) => m.id === messageId)!;
        const updated = { ...current, ...patch };
        // El destino se decide por COLUMNA si el patch la trae; si solo trae
        // estado (p. ej. el modal de edición), se cae en la primera columna
        // de esa fase — ver columnaDeTarjeta.
        const destino = columnaDeTarjeta(updated, columnas);

        if (destino === origen) {
          return {
            ...prev,
            [origen]: prev[origen]!.map((m) =>
              m.id === messageId ? updated : m,
            ),
          };
        }
        return {
          ...prev,
          [origen]: prev[origen]!.filter((m) => m.id !== messageId),
          [destino]: [updated, ...(prev[destino] ?? [])],
        };
      });
    },
    [columnas],
  );

  // `CurrentTaskBar` vive en el layout, fuera de este componente — cuando
  // marca hecha o suelta TU tarjeta activa desde ahí, esta es la única
  // forma de que este tablero ya montado se entere sin esperar a un
  // refresco de página (ver el comentario en lib/enProgresoEvents.ts).
  useEffect(() => {
    function onPatchedElsewhere(e: Event) {
      const { messageId, patch } = (
        e as CustomEvent<TaskPatchedElsewhereDetail>
      ).detail;
      applyLocalUpdate(messageId, patch);
    }
    window.addEventListener(TASK_PATCHED_ELSEWHERE_EVENT, onPatchedElsewhere);
    return () =>
      window.removeEventListener(
        TASK_PATCHED_ELSEWHERE_EVENT,
        onPatchedElsewhere,
      );
  }, [applyLocalUpdate]);

  const [activeId, setActiveId] = useState<string | null>(null);
  // Foto del tablero justo antes de empezar a arrastrar: si el guardado en
  // el servidor falla, o el arrastre se cancela (Esc) a medio camino entre
  // columnas, se restaura tal cual estaba — sin esto, un fallo de red podía
  // dejar el tablero visualmente distinto de lo que de verdad hay guardado.
  const dragSnapshot = useRef<ByColumna | null>(null);

  function handleDragStart(event: DragStartEvent) {
    // Arrastrar una COLUMNA no toca las tarjetas: sin este corte se
    // guardaría una copia de seguridad de `byEstado` que luego nadie
    // restaura, y el resto de manejadores intentarían tratar la columna
    // como si fuera una tarjeta.
    if (columnaDeDragId(String(event.active.id))) {
      setActiveId(null);
      return;
    }
    dragSnapshot.current = byEstado;
    setActiveId(String(event.active.id));
  }

  /**
   * Reordena las columnas al soltar. Optimista: se pinta el orden nuevo ya
   * y, si el servidor lo rechaza, se vuelve al que había — mismo criterio
   * que el resto de acciones del tablero.
   */
  function handleColumnDragEnd(activeIdStr: string, overIdStr: string) {
    const origen = columnaDeDragId(activeIdStr);
    const destino = columnaDeDragId(overIdStr);
    if (!origen || !destino || origen === destino) return;

    const desde = columnasLocales.findIndex((c) => c.id === origen);
    const hasta = columnasLocales.findIndex((c) => c.id === destino);
    if (desde === -1 || hasta === -1) return;

    const previas = columnasLocales;
    const nuevas = arrayMove(columnasLocales, desde, hasta);
    setColumnasLocales(nuevas);
    setAnnouncement(
      `Columna ${previas[desde]!.nombre} movida a la posición ${hasta + 1}.`,
    );
    reorderBoardColumns(nuevas.map((c) => c.id))
      .then((r) => {
        if (r.error) setColumnasLocales(previas);
      })
      .catch((err) => {
        console.error("No se pudo reordenar las columnas:", err);
        setColumnasLocales(previas);
      });
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
    // Una columna arrastrándose por encima de otra no mueve ninguna tarjeta
    // de sitio: el reordenado se resuelve entero al soltar.
    if (columnaDeDragId(activeIdStr)) return;

    setByEstado((prev) => {
      const activeContainer = findContainer(activeIdStr, prev);
      const overContainer = findContainer(overIdStr, prev);
      if (
        !activeContainer ||
        !overContainer ||
        activeContainer === overContainer
      )
        return prev;

      const activeItems = prev[activeContainer] ?? [];
      const overItems = prev[overContainer] ?? [];
      const activeIndex = activeItems.findIndex((m) => m.id === activeIdStr);
      const moving = activeItems[activeIndex];
      if (!moving) return prev;

      const overIndex = overItems.findIndex((m) => m.id === overIdStr);
      const newIndex = overIndex >= 0 ? overIndex : overItems.length;
      // La FASE de la columna destino es lo que se guarda en `estado`: con
      // columnas propias, el id de la columna ya no es un valor del enum.
      const faseDestino =
        faseDeColumna(overContainer, columnas) ?? moving.estado;
      const updatedMoving = {
        ...moving,
        estado: faseDestino,
        hecho: faseDestino === "HECHO",
        boardStatusId: esColumnaPropia(overContainer) ? overContainer : null,
      };

      return {
        ...prev,
        [activeContainer]: activeItems.filter((m) => m.id !== activeIdStr),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          updatedMoving,
          ...overItems.slice(newIndex),
        ],
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
    // Columna, no tarjeta: se reordena el tablero y se sale — `dragSnapshot`
    // ni se tocó al empezar (ver handleDragStart).
    if (columnaDeDragId(String(active.id))) {
      if (over) handleColumnDragEnd(String(active.id), String(over.id));
      return;
    }
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

    const items = prevState[container] ?? [];
    const activeIndex = items.findIndex((m) => m.id === activeIdStr);
    const overIndex = esColumna(overIdStr)
      ? items.length - 1
      : items.findIndex((m) => m.id === overIdStr);

    const reordered =
      overIndex >= 0 && activeIndex !== overIndex
        ? arrayMove(items, activeIndex, overIndex)
        : items;

    const finalIndex = reordered.findIndex((m) => m.id === activeIdStr);
    const above = reordered[finalIndex - 1];
    const below = reordered[finalIndex + 1];
    let newOrden: number;
    if (above && below) newOrden = (above.orden + below.orden) / 2;
    else if (above) newOrden = above.orden - ORDEN_STEP;
    else if (below) newOrden = below.orden + ORDEN_STEP;
    else newOrden = Date.now();

    // La fase de la columna destino: con columnas propias, `container` es
    // el id de la columna, no un valor del enum.
    const faseDestino = faseDeColumna(container, columnas);
    if (!faseDestino) return;
    // Igual que en el servidor (ver `shouldClearEnProgreso`): soltarla en
    // una columna de fase HECHO también suelta "en curso ahora".
    const clearsEnProgreso = shouldClearEnProgreso(faseDestino);
    const finalList = reordered.map((m) =>
      m.id === activeIdStr
        ? {
            ...m,
            orden: newOrden,
            ...(clearsEnProgreso
              ? { enProgresoPorId: null, enProgresoDesde: null }
              : {}),
          }
        : m,
    );
    const original = findContainer(activeIdStr, snapshot);
    const originalMessage = original
      ? snapshot[original]?.find((m) => m.id === activeIdStr)
      : undefined;

    setByEstado((current) => ({ ...current, [container]: finalList }));

    if (original !== container) {
      const nombreDestino =
        columnas.find((c) => c.id === container)?.nombre ?? "";
      setAnnouncement(
        `«${originalMessage?.resumen ?? ""}» movida a ${nombreDestino}.`,
      );
    }

    moveTask(activeIdStr, faseDestino, newOrden, container)
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
  const handleCycleEstado = useCallback(
    (messageId: string) => {
      const current = findMessage(messageId);
      if (!current) return;
      // Avanza a la siguiente COLUMNA del tablero (circular), no al siguiente
      // valor del enum: con columnas propias, "la siguiente" puede ser otra
      // columna de la misma fase (p. ej. "En diseño" → "En revisión").
      const actualId = columnaDeTarjeta(current, columnas);
      const i = columnas.findIndex((c) => c.id === actualId);
      const siguiente = columnas[(i + 1) % columnas.length];
      if (!siguiente) return;
      const target = siguiente.fase;
      // Igual que en el servidor (ver `shouldClearEnProgreso`): marcarla
      // HECHA suelta también "en curso ahora" — no tendría sentido que
      // siguiera apareciendo como que alguien la está haciendo.
      const clearsEnProgreso = shouldClearEnProgreso(target);
      const clearEnProgreso = clearsEnProgreso
        ? { enProgresoPorId: null, enProgresoDesde: null }
        : {};

      applyLocalUpdate(messageId, {
        estado: target,
        hecho: target === "HECHO",
        boardStatusId: siguiente.esPersonalizada ? siguiente.id : null,
        ...clearEnProgreso,
      });
      setAnnouncement(
        `«${current.resumen}» ahora está en ${siguiente.nombre}.`,
      );
      updateTaskStatus(messageId, target, siguiente.id)
        .then(() => {
          // Se avisa DESPUÉS de que el servidor confirme, no antes: `CurrentTaskBar`
          // reacciona a este evento releyendo del servidor, y si avisara antes,
          // podría releer justo antes de que el propio cambio se hubiera guardado.
          if (clearsEnProgreso) notifyEnProgresoChanged();
        })
        .catch((err) => {
          console.error("No se pudo cambiar el estado:", err);
          applyLocalUpdate(messageId, {
            estado: current.estado,
            hecho: current.hecho,
            boardStatusId: current.boardStatusId,
          });
        });
    },
    [findMessage, columnas, applyLocalUpdate],
  );

  const handleCyclePrioridad = useCallback(
    (messageId: string) => {
      const current = findMessage(messageId);
      if (!current) return;
      const target = nextPriority(current.prioridad);

      applyLocalUpdate(messageId, { prioridad: target });
      setAnnouncement(
        `«${current.resumen}» ahora tiene prioridad ${PRIORIDAD_PRESENTATION[target].label}.`,
      );
      updateTaskPriority(messageId, target).catch((err) => {
        console.error("No se pudo cambiar la prioridad:", err);
        applyLocalUpdate(messageId, { prioridad: current.prioridad });
      });
    },
    [findMessage, applyLocalUpdate],
  );

  // Guardar desde el modal de edición es la TERCERA vía por la que una
  // tarjeta puede llegar a HECHA (o a una categoría no accionable) —
  // arrastre y el botón "Cambiar estado" ya limpiaban "en curso ahora"
  // localmente, pero este camino se había quedado sin ello (verificado en
  // revisión de código: la tarjeta seguía mostrando "Trabajando…" tras
  // guardar HECHA desde el modal, hasta recargar la página).
  const handleSaved = useCallback(
    (messageId: string, patch: EditableFields) => {
      const clearsEnProgreso = shouldClearEnProgreso(
        patch.estado,
        patch.categoria,
      );
      applyLocalUpdate(messageId, {
        ...patch,
        ...(clearsEnProgreso
          ? { enProgresoPorId: null, enProgresoDesde: null }
          : {}),
      });
      if (clearsEnProgreso) notifyEnProgresoChanged();
    },
    [applyLocalUpdate],
  );

  /**
   * Añadir una etiqueta directamente desde la tarjeta, sin abrir el modal
   * de detalle completo — reutiliza `updateMessage` (mismo Server Action
   * que el modal de edición usa para guardar `etiquetas`, entre otros
   * campos), no hace falta una acción dedicada.
   */
  const handleEtiquetaAdd = useCallback(
    (messageId: string, etiqueta: string) => {
      const current = findMessage(messageId);
      if (!current || current.etiquetas.includes(etiqueta)) return;
      const etiquetas = [...current.etiquetas, etiqueta];
      applyLocalUpdate(messageId, { etiquetas });
      updateMessage(messageId, { etiquetas }).catch((err) => {
        console.error("No se pudo añadir la etiqueta:", err);
        applyLocalUpdate(messageId, { etiquetas: current.etiquetas });
      });
    },
    [findMessage, applyLocalUpdate],
  );

  /**
   * Asignar/desasignar una tarjeta (Fase Equipo) — mismo patrón optimista
   * que el resto. `assignMessage` no lanza en el caso de validación (p. ej.
   * el destinatario dejó de ser miembro entre que se cargó la lista y el
   * clic) — devuelve `{ error }` en vez de rechazar, así que se comprueba
   * el resultado, no solo el catch.
   */
  const handleAssigneeChange = useCallback(
    (messageId: string, assigneeId: string | null) => {
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
    },
    [findMessage, applyLocalUpdate],
  );

  /**
   * Aplazar (o quitar, con `fechaLimite: null`) la fecha límite — mismo
   * patrón optimista que el resto: aplica en local primero, y si
   * `postponeMessage` falla, se revierte.
   */
  const handlePostpone = useCallback(
    (messageId: string, fechaLimite: Date | null) => {
      const current = findMessage(messageId);
      if (!current) return;
      const previousFechaLimite = current.fechaLimite;
      applyLocalUpdate(messageId, { fechaLimite });
      postponeMessage(messageId, fechaLimite).catch((err) => {
        console.error("No se pudo aplazar la tarea:", err);
        applyLocalUpdate(messageId, { fechaLimite: previousFechaLimite });
      });
    },
    [findMessage, applyLocalUpdate],
  );

  /**
   * "Empezar"/"soltar" una tarjeta (Fase "en curso ahora"): empezarla
   * también la mueve a EN_PROGRESO local, igual que hace `startWorkingOn`
   * en el servidor — mismo criterio optimista que el resto.
   */
  const handleStartWorking = useCallback(
    (messageId: string) => {
      const current = findMessage(messageId);
      if (!current) return;
      const previous = {
        enProgresoPorId: current.enProgresoPorId,
        enProgresoDesde: current.enProgresoDesde,
        estado: current.estado,
      };
      applyLocalUpdate(messageId, {
        enProgresoPorId: currentUserId,
        enProgresoDesde: new Date(),
        estado: "EN_PROGRESO",
      });
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
    },
    [findMessage, currentUserId, applyLocalUpdate],
  );

  const handleStopWorking = useCallback(
    (messageId: string) => {
      const current = findMessage(messageId);
      if (!current) return;
      const previous = {
        enProgresoPorId: current.enProgresoPorId,
        enProgresoDesde: current.enProgresoDesde,
      };
      applyLocalUpdate(messageId, {
        enProgresoPorId: null,
        enProgresoDesde: null,
      });
      stopWorkingOn(messageId)
        .then(() => notifyEnProgresoChanged())
        .catch((err) => {
          console.error("No se pudo soltar la tarea:", err);
          applyLocalUpdate(messageId, previous);
          notifyEnProgresoChanged();
        });
    },
    [findMessage, applyLocalUpdate],
  );

  const activeMessage = activeId ? findInState(byEstado, activeId) : undefined;
  const hasAnyMessages = Object.values(byEstado).some(
    (lista) => lista.length > 0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Primero de la fila: es el filtro más "de intención" (qué vengo a
            resolver), y el que llega puesto desde las cifras de Inicio. */}
        <Select
          value={vista}
          onChange={(e) => setVista(e.target.value as VistaTablero)}
          aria-label="Vista rápida del tablero"
          className={cn(
                        vista !== "todas" && "border-accent text-accent-strong",
          )}
        >
          {VISTAS_TABLERO.filter((v) => v !== "mias" || members.length > 0).map(
            (v) => (
              <option key={v} value={v}>
                {VISTA_LABEL[v]}
              </option>
            ),
          )}
        </Select>
        <Select
          value={filtroCategoria}
          onChange={(e) =>
            setFiltroCategoria(e.target.value as Category | "todas")
          }
          aria-label="Filtrar el tablero por categoría"
        >
          <option value="todas">Cualquier categoría</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_PRESENTATION[c].label}
            </option>
          ))}
        </Select>
        <Select
          value={filtroPrioridad}
          onChange={(e) =>
            setFiltroPrioridad(e.target.value as Prioridad | "todas")
          }
          aria-label="Filtrar el tablero por prioridad"
        >
          <option value="todas">Cualquier prioridad</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {PRIORIDAD_PRESENTATION[p].label}
            </option>
          ))}
        </Select>
        {members.length > 0 && (
          <Select
            value={filtroAsignado}
            onChange={(e) => setFiltroAsignado(e.target.value)}
            aria-label="Filtrar el tablero por persona asignada"
          >
            <option value="todas">Cualquier persona</option>
            <option value="sin-asignar">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.email}
              </option>
            ))}
          </Select>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFiltroCategoria("todas");
              setFiltroPrioridad("todas");
              setFiltroAsignado("todas");
              setVista("todas");
            }}
            className="text-xs font-medium text-muted underline-offset-2 hover:text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Quitar filtros
          </button>
        )}
        {/* Separado de los filtros y empujado a la derecha: filtrar es
            "qué quiero ver ahora", esto es "cómo está montado mi tablero".
            Mezclados en la misma fila, con siete controles seguidos, no se
            distinguía una cosa de la otra. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {puedeEditar && <GestionColumnasDialog columnas={columnas} />}
          <button
            type="button"
            onClick={() =>
              setDensity(density === "compacta" ? "normal" : "compacta")
            }
            aria-pressed={density === "compacta"}
            className="rounded-full border border-paper-line bg-paper px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {density === "compacta" ? "Vista normal" : "Vista compacta"}
          </button>
        </div>
      </div>

      {!hasFilters && !hasAnyMessages ? (
        <div className="rounded-xl border border-dashed border-paper-line bg-paper-raised/60 p-8 text-center">
          <p className="text-muted">
            Todavía no hay ninguna tarea. Escríbele algo al bot de Telegram (o
            pídeselo al Asistente) y aparecerá aquí, categorizada y lista para
            organizar.
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
          <SortableContext
            items={columnasLocales.map((c) => `${COLUMN_DRAG_PREFIX}${c.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:overflow-x-auto sm:pb-2">
              {columnasLocales.map((columna) => {
                // Las columnas por defecto se renombran con `boardLabels`
                // (estado optimista, ver handleRenameColumn) — las propias
                // llevan su nombre real ya en `columna.nombre`, puesto que
                // vienen de BoardStatus y se renombran por otra vía
                // (GestionColumnasDialog). Sin este `??`, un renombrado de
                // "Por hacer"/"En progreso"/"Hecho" se guardaba bien en la
                // base de datos pero la pantalla volvía a mostrar el nombre
                // viejo al instante, porque nada leía `boardLabels`.
                const columnaMostrada = columna.esPersonalizada
                  ? columna
                  : { ...columna, nombre: boardLabels[columna.fase] ?? columna.nombre };
                return (
                <KanbanColumn
                  key={columna.id}
                  columna={columnaMostrada}
                  canReorder={puedeReordenar}
                  messages={byEstado[columna.id] ?? EMPTY_LIST}
                  totalReal={totalPorColumna[columna.id]}
                  density={density}
                  members={members}
                  currentUserId={currentUserId}
                  filtroCategoria={filtroCategoria}
                  filtroPrioridad={filtroPrioridad}
                  filtroAsignado={filtroAsignado}
                  vista={vista}
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
                  canRename={puedeEditar}
                  onRename={handleRenameColumn}
                  onCreated={puedeEditar ? handleCreated : undefined}
                />
                );
              })}
            </div>
          </SortableContext>
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
