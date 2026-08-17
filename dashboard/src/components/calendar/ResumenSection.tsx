"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Message, Evento } from "@prisma/client";
import { Square, Clock, ListChecks } from "lucide-react";
import { updateTaskStatus } from "@/app/(dashboard)/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { groupByDay, dayLabel } from "@/lib/calendar";
import { formatEventDate } from "@/lib/format";
import { Avatar } from "../ui/avatar";
import { EventDetailDialog } from "../EventDetailDialog";

/**
 * "Resumen" del calendario (a petición del usuario: un sitio que diga, de
 * un vistazo, lo importante — como un diario, no una lista de tareas
 * suelta): checklist de tareas/recordatorios de prioridad alta aún sin
 * hacer, y los eventos de los próximos días agrupados por día. Vive
 * aparte de la cuadrícula mensual (CalendarView), no dentro.
 */
export function ResumenSection({
  importantPending,
  upcomingEventos,
  members = [],
}: {
  importantPending: Message[];
  upcomingEventos: Evento[];
  /** Miembros del workspace activo, para mostrar quién tiene asignado cada evento — vacío en modo personal. */
  members?: WorkspaceMemberInfo[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(importantPending);

  function memberOf(assigneeId: string | null): WorkspaceMemberInfo | undefined {
    return members.find((m) => m.userId === assigneeId);
  }

  function handleToggleDone(message: Message) {
    setPending((prev) => prev.filter((m) => m.id !== message.id));
    updateTaskStatus(message.id, "HECHO").catch((err) => {
      console.error("No se pudo marcar como hecho:", err);
      setPending((prev) => [message, ...prev]);
    });
  }

  const eventosPorDia = groupByDay(upcomingEventos, (e) => e.fechaInicio);

  return (
    <section
      aria-labelledby="resumen-heading"
      className="fade-in flex flex-col gap-4 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm"
    >
      <h2
        id="resumen-heading"
        className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        <ListChecks aria-hidden size={14} /> Resumen
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">Importante y pendiente</h3>
          {pending.length === 0 ? (
            <p className="text-sm text-muted">Nada de prioridad alta pendiente. Todo al día.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pending.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => handleToggleDone(message)}
                    className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left text-sm text-ink transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Square aria-hidden size={16} className="mt-0.5 shrink-0 text-muted" />
                    {message.resumen}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">Próximos días</h3>
          {eventosPorDia.size === 0 ? (
            <p className="text-sm text-muted">No tienes eventos en los próximos días.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {[...eventosPorDia.entries()].map(([key, eventos]) => (
                <div key={key}>
                  <p className="mb-1 text-xs font-semibold text-muted uppercase">{dayLabel(key)}</p>
                  <ul className="flex flex-col gap-1">
                    {eventos.map((evento) => {
                      const assignee = memberOf(evento.assigneeId);
                      return (
                        <EventDetailDialog
                          key={evento.id}
                          evento={evento}
                          members={members}
                          onChanged={() => router.refresh()}
                        >
                          <li className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 text-sm text-ink transition-colors hover:bg-accent-soft">
                            <Clock aria-hidden size={13} className="shrink-0 text-accent" />
                            <span className="text-xs text-muted">{formatEventDate(evento.fechaInicio)}</span>
                            <span className="flex-1 truncate">{evento.titulo}</span>
                            {assignee && <Avatar email={assignee.email} size="xs" className="shrink-0" />}
                          </li>
                        </EventDetailDialog>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

