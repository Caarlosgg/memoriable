"use client";

import type { ReactNode } from "react";
import type { Evento, Message } from "@prisma/client";
import { Clock, CalendarOff } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { dayLabel, dateKey } from "@/lib/calendar";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EventDetailDialog } from "../EventDetailDialog";
import { MessageDetailDialog } from "../MessageDetailDialog";

/**
 * Todo lo de UN día, en una ficha.
 *
 * Nace de un problema de móvil: en una pantalla de 390px cada casilla del
 * mes mide unos 50px, así que los textos de los eventos quedaban recortados
 * a dos letras — ilegibles. En móvil la casilla muestra solo puntos y se
 * toca para abrir esto, que sí tiene sitio para leerlo.
 *
 * De paso arregla una promesa incumplida: la ayuda de la página decía "haz
 * clic en un día para ver el detalle", pero los días no hacían nada.
 */
export function DayDetailDialog({
  date,
  eventos,
  tareas,
  members,
  ahora,
  onChanged,
  onDeleted,
  onUndoDelete,
  children,
}: {
  date: Date;
  eventos: Evento[];
  tareas: Message[];
  members: WorkspaceMemberInfo[];
  /** "Ahora" lo decide quien llama, para que todas las casillas del mes comparen contra el mismo instante. */
  ahora: Date;
  onChanged: () => void;
  onDeleted: (id: string) => void;
  onUndoDelete: (id: string) => void;
  children: ReactNode;
}) {
  const vacio = eventos.length === 0 && tareas.length === 0;

  function memberOf(assigneeId: string | null): WorkspaceMemberInfo | undefined {
    return members.find((m) => m.userId === assigneeId);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          {/* first-letter:uppercase: `dayLabel` devuelve el día en minúscula. */}
          <DialogTitle className="first-letter:uppercase">{dayLabel(dateKey(date))}</DialogTitle>
        </DialogHeader>

        {vacio ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <CalendarOff aria-hidden size={15} /> Nada para este día.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {eventos.map((evento) => {
              const assignee = memberOf(evento.assigneeId);
              return (
                <li key={evento.id}>
                  <EventDetailDialog
                    evento={evento}
                    members={members}
                    onChanged={onChanged}
                    onDeleted={onDeleted}
                    onUndoDelete={onUndoDelete}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm transition-colors hover:bg-accent-soft"
                    >
                      <Clock aria-hidden size={14} className="shrink-0 text-accent" />
                      <span className="shrink-0 text-xs text-muted tabular-nums">{formatEventTime(evento.fechaInicio)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{evento.titulo}</span>
                      {assignee && <Avatar email={assignee.email} size="xs" />}
                    </button>
                  </EventDetailDialog>
                </li>
              );
            })}

            {tareas.map((tarea) => {
              const assignee = memberOf(tarea.assigneeId);
              const { Icon, color } = presentCategory(tarea.categoria);
              const vencida = tarea.fechaLimite != null && tarea.fechaLimite < ahora;
              return (
                <li key={tarea.id}>
                  <MessageDetailDialog message={tarea} members={members} onDeleted={onDeleted} onUndoDelete={onUndoDelete}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm transition-colors hover:bg-accent-soft"
                    >
                      <Icon aria-hidden size={14} className={`shrink-0 ${vencida ? "text-danger" : color}`} />
                      <span className={`min-w-0 flex-1 truncate ${vencida ? "text-danger" : "text-ink"}`}>{tarea.resumen}</span>
                      {vencida && <span className="shrink-0 text-[10px] font-semibold text-danger">vencida</span>}
                      {assignee && <Avatar email={assignee.email} size="xs" />}
                    </button>
                  </MessageDetailDialog>
                </li>
              );
            })}
          </ul>
        )}

        {members.length > 0 && !vacio && (
          <p className="mt-3 text-xs text-muted">
            {[...new Set([...eventos, ...tareas].map((x) => memberOf(x.assigneeId)?.email).filter(Boolean))]
              .map((email) => shortEmailName(email as string))
              .join(", ") || "Sin asignar"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
