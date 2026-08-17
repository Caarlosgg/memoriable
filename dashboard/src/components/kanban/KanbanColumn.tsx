"use client";

import { memo, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Pencil, Check, X } from "lucide-react";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import { ESTADO_PRESENTATION } from "@/lib/kanban";
import type { Category } from "@/lib/categories";
import { MessageDetailDialog, type EditableFields } from "@/components/MessageDetailDialog";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { KanbanCard } from "./KanbanCard";
import type { KanbanDensity } from "./useKanbanDensity";

interface KanbanColumnProps {
  estado: EstadoTarea;
  /** Sin filtrar todavía — el filtrado ocurre aquí dentro (ver `useMemo` más abajo), no en KanbanBoard. */
  messages: Message[];
  density: KanbanDensity;
  members?: WorkspaceMemberInfo[];
  currentUserId: string;
  filtroCategoria: Category | "todas";
  filtroPrioridad: Prioridad | "todas";
  filtroAsignado: string;
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
  /** Nombre personalizado de esta columna (ver Workspace.boardLabels) — ausente = etiqueta por defecto. */
  label?: string;
  /** VIEWER no puede renombrar — mismo permiso que crear/editar contenido. */
  canRename?: boolean;
  onRename?: (estado: EstadoTarea, nombre: string | null) => void;
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
  estado,
  messages,
  density,
  members,
  currentUserId,
  filtroCategoria,
  filtroPrioridad,
  filtroAsignado,
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
  label: customLabel,
  canRename = false,
  onRename,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: estado });
  const { label: defaultLabel, Icon, color } = ESTADO_PRESENTATION[estado];
  const label = customLabel || defaultLabel;
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(label);

  function startEditing() {
    setNameInput(label);
    setEditing(true);
  }
  function handleSaveLabel() {
    const trimmed = nameInput.trim();
    onRename?.(estado, trimmed === defaultLabel || trimmed === "" ? null : trimmed);
    setEditing(false);
  }

  const filtered = useMemo(
    () =>
      messages.filter((message) => {
        if (hiddenIds.has(message.id)) return false;
        if (filtroCategoria !== "todas" && message.categoria !== filtroCategoria) return false;
        if (filtroPrioridad !== "todas" && message.prioridad !== filtroPrioridad) return false;
        if (filtroAsignado === "sin-asignar" && message.assigneeId !== null) return false;
        if (filtroAsignado !== "todas" && filtroAsignado !== "sin-asignar" && message.assigneeId !== filtroAsignado) {
          return false;
        }
        return true;
      }),
    [messages, hiddenIds, filtroCategoria, filtroPrioridad, filtroAsignado],
  );

  return (
    <section
      aria-labelledby={`columna-${estado}`}
      className={`flex min-w-[260px] flex-1 flex-col gap-3 rounded-2xl border p-3 transition-colors ${
        isOver ? "border-accent bg-accent-soft/60" : "border-paper-line bg-paper-raised/60"
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
          id={`columna-${estado}`}
          className="flex items-center gap-2 text-sm font-semibold text-ink"
        >
          <Icon aria-hidden size={16} className={color} />
          {label}
          {canRename && (
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

      <SortableContext items={filtered.map((m) => m.id)} strategy={verticalListSortingStrategy}>
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
    </section>
  );
}

export const KanbanColumn = memo(KanbanColumnImpl);
