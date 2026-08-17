"use client";

import * as React from "react";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Message } from "@prisma/client";
import { Clock, Tag, Plus, ListChecks, Play, Square } from "lucide-react";
import { presentCategory, esAccionable } from "@/lib/categories";
import { PRIORIDAD_PRESENTATION, PRIORIDAD_ICON, ESTADO_PRESENTATION } from "@/lib/kanban";
import { formatDate, shortEmailName } from "@/lib/format";
import { checklistToArray, checklistProgress } from "@/lib/checklist";
import { cn } from "@/lib/utils";
import { AssigneeControl } from "@/components/AssigneeControl";
import { PostponeControl } from "@/components/PostponeControl";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import type { KanbanDensity } from "./useKanbanDensity";

interface KanbanCardContentProps {
  message: Message;
  density: KanbanDensity;
  /** Miembros del workspace activo, para "Asignar a…" — vacío en modo personal (ver BoardSection.tsx). */
  members?: WorkspaceMemberInfo[];
  /** Quién ha iniciado sesión — para saber si "en curso" eres tú o alguien más (ver `WorkingOnControl`). */
  currentUserId?: string;
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
  onPostpone?: (messageId: string, fechaLimite: Date | null) => void;
  onStartWorking?: (messageId: string) => void;
  onStopWorking?: (messageId: string) => void;
}

/**
 * "Empezar"/"en curso"/"trabajando" — Fase "en curso ahora": una tarjeta
 * accionable sin terminar puede tener a alguien trabajando en ella EN ESTE
 * MOMENTO, distinto de a quién está asignada (ver el comentario del campo
 * en el esquema). Solo botón/badge, sin dropdown: es una acción binaria
 * (empezar/soltar), no hace falta el peso de un menú para eso.
 */
function WorkingOnControl({
  message,
  currentUserId,
  members,
  onStartWorking,
  onStopWorking,
}: {
  message: Message;
  currentUserId: string;
  members: WorkspaceMemberInfo[];
  onStartWorking: (messageId: string) => void;
  onStopWorking: (messageId: string) => void;
}) {
  if (message.enProgresoPorId === null) {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onStartWorking(message.id);
        }}
        title="Empezar a trabajar en esto ahora"
        className="flex items-center gap-1 rounded-full border border-dashed border-paper-line px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Play aria-hidden size={11} /> Empezar
      </button>
    );
  }

  if (message.enProgresoPorId === currentUserId) {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onStopWorking(message.id);
        }}
        title="Dejar de trabajar en esto"
        className="flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Square aria-hidden size={10} /> Trabajando…
      </button>
    );
  }

  const email = members.find((m) => m.userId === message.enProgresoPorId)?.email;
  return (
    <span
      title={email ? `${email} está trabajando en esto ahora` : "Alguien está trabajando en esto ahora"}
      className="flex items-center gap-1 rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-ink"
    >
      <Play aria-hidden size={11} className="text-accent" /> {email ? shortEmailName(email) : "en curso"}
    </span>
  );
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
  currentUserId,
  onCycleEstado,
  onCyclePrioridad,
  onEtiquetaAdd,
  onAssigneeChange,
  onPostpone,
  onStartWorking,
  onStopWorking,
}: KanbanCardContentProps) {
  const { Icon: CategoryIcon, color } = presentCategory(message.categoria);
  const priority = PRIORIDAD_PRESENTATION[message.prioridad];
  const PriorityIcon = PRIORIDAD_ICON;
  const estado = ESTADO_PRESENTATION[message.estado];
  const EstadoIcon = estado.Icon;
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

      {(() => {
        const { hechos, total } = checklistProgress(checklistToArray(message.checklist));
        if (total === 0) return null;
        return (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted">
            <ListChecks aria-hidden size={11} className={hechos === total ? "text-accent" : undefined} />
            {hechos}/{total}
          </p>
        );
      })()}

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
              aria-label={`Estado ${estado.label}. Cambiar.`}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-[filter] hover:brightness-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${estado.colorSoft} ${estado.color}`}
            >
              <EstadoIcon aria-hidden size={11} />
              {estado.label}
            </button>
          ) : (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${estado.colorSoft} ${estado.color}`}>
              <EstadoIcon aria-hidden size={11} />
              {estado.label}
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
          {onPostpone && esAccionable(message.categoria) && (
            <PostponeControl
              fechaLimite={message.fechaLimite}
              onChange={(fechaLimite) => onPostpone(message.id, fechaLimite)}
            />
          )}
          {onStartWorking && onStopWorking && currentUserId && esAccionable(message.categoria) && message.estado !== "HECHO" && (
            <WorkingOnControl
              message={message}
              currentUserId={currentUserId}
              members={members}
              onStartWorking={onStartWorking}
              onStopWorking={onStopWorking}
            />
          )}
          {onAssigneeChange && members.length > 0 && (
            <AssigneeControl
              assigneeId={message.assigneeId}
              members={members}
              onChange={(assigneeId) => onAssigneeChange(message.id, assigneeId)}
              variant="compact"
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
  currentUserId?: string;
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
  onPostpone?: (messageId: string, fechaLimite: Date | null) => void;
  onStartWorking?: (messageId: string) => void;
  onStopWorking?: (messageId: string) => void;
}

/**
 * `forwardRef` + spread de `...rest`: igual criterio que `MessageCard.tsx`
 * — `MessageDetailDialog` la usa como disparador (`DialogTrigger asChild`),
 * que necesita inyectar `onClick`/`ref` sin dejar de ser el `<li>`
 * arrastrable de dnd-kit.
 */
const KanbanCardImpl = React.forwardRef<HTMLLIElement, KanbanCardProps>(function KanbanCard(
  {
    message,
    density,
    members,
    currentUserId,
    onCycleEstado,
    onCyclePrioridad,
    onEtiquetaAdd,
    onAssigneeChange,
    onPostpone,
    onStartWorking,
    onStopWorking,
    className,
    ...rest
  },
  forwardedRef,
) {
  // useSortable (no useDraggable a secas): registra la tarjeta TAMBIÉN
  // como zona de soltado (droppable), no solo como arrastrable — sin eso,
  // `over` durante un arrastre nunca podría resolverse a OTRA tarjeta (solo
  // a la columna entera), y el reordenado dentro de la misma columna no
  // tendría forma de saber sobre qué tarjeta se soltó.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: message.id });
  const { borderAccent } = presentCategory(message.categoria);
  // Fondo con un lavado de color por estado (además del badge, ya coloreado
  // desde antes) — Por hacer se queda neutro a propósito, para no competir
  // con el borde de categoría; En progreso/Hecho sí llevan su color porque
  // son los dos estados que de verdad interesa distinguir de un vistazo en
  // un tablero cargado.
  const cardBg = message.estado === "POR_HACER" ? "bg-paper-raised" : ESTADO_PRESENTATION[message.estado].colorSoft;

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
        "fade-in touch-none rounded-xl border border-l-4 border-paper-line shadow-sm transition-shadow hover:shadow-md",
        cardBg,
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
        currentUserId={currentUserId}
        onCycleEstado={onCycleEstado}
        onCyclePrioridad={onCyclePrioridad}
        onEtiquetaAdd={onEtiquetaAdd}
        onAssigneeChange={onAssigneeChange}
        onPostpone={onPostpone}
        onStartWorking={onStartWorking}
        onStopWorking={onStopWorking}
      />
    </li>
  );
});

/**
 * `memo`: cuando `KanbanColumn` re-renderiza (p. ej. porque otra tarjeta de
 * la misma columna cambió), las tarjetas cuyo `message` y callbacks no han
 * cambiado no tienen por qué volver a montarse — con muchas tarjetas en una
 * columna (tablero de equipo cargado) esto es la diferencia entre notar el
 * arrastre fluido o con tirones.
 */
export const KanbanCard = React.memo(KanbanCardImpl);
