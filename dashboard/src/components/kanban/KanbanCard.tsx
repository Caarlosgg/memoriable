"use client";

import * as React from "react";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Message } from "@prisma/client";
import { Clock, Tag, Plus } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { PRIORIDAD_PRESENTATION, PRIORIDAD_ICON, ESTADO_PRESENTATION } from "@/lib/kanban";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssigneeControl } from "@/components/AssigneeControl";
import type { WorkspaceMemberInfo } from "@/app/(dashboard)/equipo/actions";
import type { KanbanDensity } from "./useKanbanDensity";

interface KanbanCardContentProps {
  message: Message;
  density: KanbanDensity;
  /** Miembros del workspace activo, para "Asignar a…" — vacío en modo personal (ver BoardSection.tsx). */
  members?: WorkspaceMemberInfo[];
  /**
   * Handlers opcionales: si faltan, la tarjeta se pinta en modo "solo
   * lectura" (badges planos en vez de botones) — el caso de la copia
   * fantasma que sigue al puntero durante el arrastre (`DragOverlay` en
   * KanbanBoard.tsx), que no debe reaccionar a ningún clic.
   */
  onCycleEstado?: (messageId: string) => void;
  onCyclePrioridad?: (messageId: string) => void;
  onEtiquetaAdd?: (messageId: string, etiqueta: string) => void;
  onAssigneeChange?: (messageId: string, assigneeId: string | null) => void;
}

/**
 * Contenido visual puro de la tarjeta, sin nada de arrastre — separado de
 * `KanbanCard` para poder reutilizarlo tal cual en el `DragOverlay` (la
 * copia que sigue al puntero mientras se arrastra), que necesita verse
 * IGUAL que la tarjeta real pero no es en sí misma arrastrable ni
 * interactiva.
 */
export function KanbanCardContent({
  message,
  density,
  members = [],
  onCycleEstado,
  onCyclePrioridad,
  onEtiquetaAdd,
  onAssigneeChange,
}: KanbanCardContentProps) {
  const { Icon: CategoryIcon, color } = presentCategory(message.categoria);
  const priority = PRIORIDAD_PRESENTATION[message.prioridad];
  const PriorityIcon = PRIORIDAD_ICON;
  const EstadoIcon = ESTADO_PRESENTATION[message.estado].Icon;
  const compacta = density === "compacta";

  const [addingTag, setAddingTag] = useState(false);
  const [tagValue, setTagValue] = useState("");

  function submitTag() {
    const value = tagValue.trim();
    if (value) onEtiquetaAdd?.(message.id, value);
    setTagValue("");
    setAddingTag(false);
  }

  return (
    <>
      <p className={cn("flex items-center gap-1.5 font-semibold", color, compacta ? "mb-0.5 text-[11px]" : "mb-1 text-xs")}>
        <CategoryIcon aria-hidden size={compacta ? 11 : 13} />
        {presentCategory(message.categoria).label}
      </p>
      <p className={cn("font-display leading-snug font-semibold text-ink", compacta ? "text-xs" : "text-sm")}>
        {message.resumen}
      </p>
      {!compacta && <p className="mt-1 line-clamp-2 text-xs text-muted">{message.contenido}</p>}

      {message.etiquetas.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {message.etiquetas.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-strong"
            >
              <Tag aria-hidden size={9} /> {tag}
            </li>
          ))}
        </ul>
      )}

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t border-paper-line",
          compacta ? "mt-1.5 pt-1.5" : "mt-2.5 pt-2",
        )}
      >
        {!compacta && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <Clock aria-hidden size={11} /> {formatDate(message.fecha)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {onCycleEstado ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCycleEstado(message.id);
              }}
              title="Cambiar estado"
              aria-label={`Estado ${ESTADO_PRESENTATION[message.estado].label}. Cambiar.`}
              className="flex items-center gap-1 rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-ink transition-[filter] hover:brightness-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <EstadoIcon aria-hidden size={11} />
              {ESTADO_PRESENTATION[message.estado].label}
            </button>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-ink">
              <EstadoIcon aria-hidden size={11} />
              {ESTADO_PRESENTATION[message.estado].label}
            </span>
          )}
          {onCyclePrioridad ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCyclePrioridad(message.id);
              }}
              title="Cambiar prioridad"
              aria-label={`Prioridad ${priority.label}. Cambiar.`}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-[filter] hover:brightness-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${priority.colorSoft} ${priority.color}`}
            >
              <PriorityIcon aria-hidden size={11} />
              {priority.label}
            </button>
          ) : (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${priority.colorSoft} ${priority.color}`}>
              <PriorityIcon aria-hidden size={11} />
              {priority.label}
            </span>
          )}
          {onEtiquetaAdd &&
            (addingTag ? (
              <input
                autoFocus
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitTag();
                  }
                  if (e.key === "Escape") {
                    setTagValue("");
                    setAddingTag(false);
                  }
                }}
                onBlur={submitTag}
                placeholder="Etiqueta…"
                aria-label="Nueva etiqueta"
                className="w-20 rounded-full border border-paper-line bg-paper px-2 py-0.5 text-xs text-ink outline-none focus-visible:border-accent"
              />
            ) : (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingTag(true);
                }}
                title="Añadir etiqueta"
                aria-label="Añadir etiqueta"
                className="flex items-center gap-0.5 rounded-full border border-dashed border-paper-line px-1.5 py-0.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus aria-hidden size={11} />
              </button>
            ))}
          {onAssigneeChange && members.length > 0 && (
            <AssigneeControl
              assigneeId={message.assigneeId}
              members={members}
              onChange={(assigneeId) => onAssigneeChange(message.id, assigneeId)}
            />
          )}
        </div>
      </div>
    </>
  );
}

interface KanbanCardProps extends React.LiHTMLAttributes<HTMLLIElement> {
  message: Message;
  density: KanbanDensity;
  members?: WorkspaceMemberInfo[];
  /**
   * El cambio de estado/prioridad/etiqueta/asignación de un clic lo decide
   * `KanbanBoard` (no esta tarjeta): solo así puede aplicar la misma
   * actualización optimista que ya usa el arrastre, moviendo la tarjeta de
   * columna en el estado local sin esperar a un refresco de página —
   * `revalidatePath` por sí solo no toca el estado de un Client Component
   * ya montado.
   */
  onCycleEstado: (messageId: string) => void;
  onCyclePrioridad: (messageId: string) => void;
  onEtiquetaAdd: (messageId: string, etiqueta: string) => void;
  onAssigneeChange?: (messageId: string, assigneeId: string | null) => void;
}

/**
 * `forwardRef` + spread de `...rest`: igual criterio que `MessageCard.tsx`
 * — `MessageDetailDialog` la usa como disparador (`DialogTrigger asChild`),
 * que necesita inyectar `onClick`/`ref` sin dejar de ser el `<li>`
 * arrastrable de dnd-kit.
 */
export const KanbanCard = React.forwardRef<HTMLLIElement, KanbanCardProps>(function KanbanCard(
  { message, density, members, onCycleEstado, onCyclePrioridad, onEtiquetaAdd, onAssigneeChange, className, ...rest },
  forwardedRef,
) {
  // useSortable (no useDraggable a secas): registra la tarjeta TAMBIÉN
  // como zona de soltado (droppable), no solo como arrastrable — sin eso,
  // `over` durante un arrastre nunca podría resolverse a OTRA tarjeta (solo
  // a la columna entera), y el reordenado dentro de la misma columna no
  // tendría forma de saber sobre qué tarjeta se soltó.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: message.id });
  const { borderAccent } = presentCategory(message.categoria);

  function setRefs(node: HTMLLIElement | null) {
    setNodeRef(node);
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
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
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      className={cn(
        "fade-in touch-none rounded-xl border border-l-4 border-paper-line bg-paper-raised shadow-sm transition-shadow hover:shadow-md",
        density === "compacta" ? "p-2" : "p-3",
        borderAccent,
        isDragging ? "z-10 opacity-50 shadow-lg" : "",
        className,
      )}
    >
      <KanbanCardContent
        message={message}
        density={density}
        members={members}
        onCycleEstado={onCycleEstado}
        onCyclePrioridad={onCyclePrioridad}
        onEtiquetaAdd={onEtiquetaAdd}
        onAssigneeChange={onAssigneeChange}
      />
    </li>
  );
});
