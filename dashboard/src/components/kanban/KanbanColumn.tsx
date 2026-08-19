"use client";

import { memo, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Pencil, Check, X, GripVertical } from "lucide-react";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import {
  ESTADO_PRESENTATION,
  matchesVista,
  type VistaTablero,
} from "@/lib/kanban";
import { COLUMN_DRAG_PREFIX, type ColumnaTablero } from "@/lib/boardColumns";
import type { Category } from "@/lib/categories";
import {
  MessageDetailDialog,
  type EditableFields,
} from "@/components/MessageDetailDialog";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { KanbanCard } from "./KanbanCard";
import { AddCardInline } from "./AddCardInline";
import type { KanbanDensity } from "./useKanbanDensity";

interface KanbanColumnProps {
  /** La columna que se pinta — propia del workspace o una de las tres de siempre (ver boardColumns.ts). */
  columna: ColumnaTablero;
  /** Sin filtrar todavía — el filtrado ocurre aquí dentro (ver `useMemo` más abajo), no en KanbanBoard. */
  messages: Message[];
  density: KanbanDensity;
  members?: WorkspaceMemberInfo[];
  currentUserId: string;
  filtroCategoria: Category | "todas";
  filtroPrioridad: Prioridad | "todas";
  filtroAsignado: string;
  /** Vista rápida (vencidas/hoy/mías) — ver matchesVista en lib/kanban.ts. */
  vista: VistaTablero;
  hiddenIds: Set<string>;
  onCycleEstado: (messageId: string) => void;
  onCyclePrioridad: (messageId: string) => void;
  onEtiquetaAdd: (messageId: string, etiqueta: string) => void;
  onAssigneeChange?: (messageId: string, assigneeId: string | null) => void;
  onPostpone: (messageId: string, fechaLimite: Date | null) => void;
  onStartWorking: (messageId: string) => void;
  onStopWorking: (messageId: string) => void;
  onSaved: (id: string, patch: EditableFields) => void;
  onDeleted: (id: string) => void;
  onUndoDelete: (id: string) => void;
  /** VIEWER no puede renombrar — mismo permiso que crear/editar contenido. */
  canRename?: boolean;
  /** Deja arrastrar esta columna para reordenar el tablero (ver COLUMN_DRAG_PREFIX). */
  canReorder?: boolean;
  onRename?: (estado: EstadoTarea, nombre: string | null) => void;
  /** Tarjeta creada desde esta columna — el tablero la coloca sin recargar. */
  onCreated?: (message: Message) => void;
}

/**
 * `memo` de verdad útil: antes, `KanbanBoard` pasaba
 * `byEstado[estado].filter(matchesFilter)` — un array NUEVO en cada
 * render suyo (p. ej. cada evento de arrastre entre OTRAS dos columnas),
 * así que ninguna columna podía evitar re-renderizarse por mucho `memo`
 * que tuviera: la prop `messages` nunca era `===` a la anterior. Ahora
 * `KanbanBoard` pasa el array SIN filtrar de esa columna (que sí
 * conserva su referencia cuando esa columna no cambia) y el filtrado se
 * calcula aquí dentro con `useMemo` — así una columna ajena a un
 * arrastre/edición de verdad no vuelve a renderizarse.
 */
function KanbanColumnImpl({
  columna,
  messages,
  density,
  members,
  currentUserId,
  filtroCategoria,
  filtroPrioridad,
  filtroAsignado,
  vista,
  hiddenIds,
  onCycleEstado,
  onCyclePrioridad,
  onEtiquetaAdd,
  onAssigneeChange,
  onPostpone,
  onStartWorking,
  onStopWorking,
  onSaved,
  onDeleted,
  onUndoDelete,
  canRename = false,
  canReorder = false,
  onRename,
  onCreated,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columna.id });
  /**
   * Arrastrar la COLUMNA entera para reordenar el tablero. Va con el id
   * prefijado (`col:`) y no con el de la columna a secas, porque ese id ya
   * está cogido por el `useDroppable` de arriba: sin prefijo, dnd-kit
   * tendría un mismo id registrado como origen y como destino a la vez.
   * De paso, el prefijo es lo que le permite al tablero distinguir de un
   * vistazo si lo que se está arrastrando es una tarjeta o una columna.
   */
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setHandleRef,
    isDragging: columnaArrastrandose,
  } = useSortable({
    id: `${COLUMN_DRAG_PREFIX}${columna.id}`,
    disabled: !canReorder,
  });
  // El icono y el color salen de la FASE de la columna: dos columnas
  // propias de la misma fase (p. ej. "En diseño" y "En revisión") se leen
  // como lo que son, dos pasos de "en curso".
  const {
    label: defaultLabel,
    Icon,
    color,
  } = ESTADO_PRESENTATION[columna.fase];
  const label = columna.nombre;
  // Las columnas PROPIAS se renombran desde su propio diálogo de gestión
  // (ver GestionColumnasDialog): aquí solo se renombran las tres de
  // siempre, que es lo que este lápiz ha hecho desde el principio.
  const puedeRenombrarAqui = canRename && !columna.esPersonalizada;
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(label);

  function startEditing() {
    setNameInput(label);
    setEditing(true);
  }
  function handleSaveLabel() {
    const trimmed = nameInput.trim();
    onRename?.(
      columna.fase,
      trimmed === defaultLabel || trimmed === "" ? null : trimmed,
    );
    setEditing(false);
  }

  const filtered = useMemo(
    () =>
      messages.filter((message) => {
        if (hiddenIds.has(message.id)) return false;
        if (
          filtroCategoria !== "todas" &&
          message.categoria !== filtroCategoria
        )
          return false;
        if (
          filtroPrioridad !== "todas" &&
          message.prioridad !== filtroPrioridad
        )
          return false;
        if (filtroAsignado === "sin-asignar" && message.assigneeId !== null)
          return false;
        if (
          filtroAsignado !== "todas" &&
          filtroAsignado !== "sin-asignar" &&
          message.assigneeId !== filtroAsignado
        ) {
          return false;
        }
        if (!matchesVista(message, vista, currentUserId)) return false;
        return true;
      }),
    [
      messages,
      hiddenIds,
      filtroCategoria,
      filtroPrioridad,
      filtroAsignado,
      vista,
      currentUserId,
    ],
  );

  return (
    <section
      aria-labelledby={`columna-${columna.id}`}
      className={`flex min-w-[260px] flex-1 flex-col gap-3 rounded-2xl border p-3 transition-colors ${
        columnaArrastrandose ? "opacity-50" : ""
      } ${
        isOver
          ? "border-accent bg-accent-soft/60"
          : "border-paper-line bg-paper-raised/60"
      }`}
    >
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Icon aria-hidden size={16} className={`shrink-0 ${color}`} />
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveLabel();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={30}
            aria-label={`Nombre de la columna ${defaultLabel}`}
            className="min-w-0 flex-1 rounded-lg border border-accent bg-paper px-2 py-1 text-sm text-ink outline-none"
          />
          <button
            type="button"
            onClick={handleSaveLabel}
            aria-label="Guardar nombre"
            className="shrink-0 rounded-full p-1 text-accent transition-colors hover:bg-accent-soft"
          >
            <Check aria-hidden size={15} />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancelar"
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <X aria-hidden size={15} />
          </button>
        </div>
      ) : (
        <h3
          id={`columna-${columna.id}`}
          className="flex items-center gap-2 text-sm font-semibold text-ink"
        >
          {/* Asa explícita en vez de arrastrar la cabecera entera: el
              título también se puede pulsar para renombrar, y sin un punto
              de agarre claro los dos gestos se pisan. */}
          {canReorder && (
            <button
              ref={setHandleRef}
              {...dragAttributes}
              {...dragListeners}
              type="button"
              aria-label={`Mover la columna ${label}`}
              title="Arrastra para cambiar el orden de las columnas"
              className="-ml-1 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:cursor-grabbing"
            >
              <GripVertical aria-hidden size={14} />
            </button>
          )}
          <Icon aria-hidden size={16} className={color} />
          {label}
          {puedeRenombrarAqui && (
            <button
              type="button"
              onClick={startEditing}
              aria-label={`Renombrar la columna ${label}`}
              className="rounded-full p-1 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong"
            >
              <Pencil aria-hidden size={12} />
            </button>
          )}
          <span className="ml-auto rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-muted">
            {filtered.length}
          </span>
        </h3>
      )}

      <SortableContext
        items={filtered.map((m) => m.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul ref={setNodeRef} className="flex min-h-[80px] flex-col gap-2.5">
          {filtered.length === 0 ? (
            <li className="rounded-lg border border-dashed border-paper-line p-4 text-center text-xs text-muted">
              Nada por aquí.
            </li>
          ) : (
            filtered.map((message) => (
              <MessageDetailDialog
                key={message.id}
                message={message}
                defaultEditing
                members={members}
                onAssigneeChange={onAssigneeChange}
                onSaved={onSaved}
                onDeleted={onDeleted}
                onUndoDelete={onUndoDelete}
              >
                <KanbanCard
                  message={message}
                  density={density}
                  members={members}
                  currentUserId={currentUserId}
                  className="cursor-pointer"
                  onCycleEstado={onCycleEstado}
                  onCyclePrioridad={onCyclePrioridad}
                  onEtiquetaAdd={onEtiquetaAdd}
                  onAssigneeChange={onAssigneeChange}
                  onPostpone={onPostpone}
                  onStartWorking={onStartWorking}
                  onStopWorking={onStopWorking}
                />
              </MessageDetailDialog>
            ))
          )}
        </ul>
      </SortableContext>

      {/* Fuera del SortableContext: no es una tarjeta arrastrable, es el
          hueco donde escribir la siguiente. Solo si se puede escribir de
          verdad — VIEWER ve el tablero pero no lo llena. */}
      {onCreated && (
        <AddCardInline columnaId={columna.id} onCreated={onCreated} />
      )}
    </section>
  );
}

export const KanbanColumn = memo(KanbanColumnImpl);
