import Link from "next/link";
import { TriangleAlert, CalendarDays, Clock, Loader2, Inbox, Sparkles, MessagesSquare } from "lucide-react";
import { getTodayOverview } from "@/lib/todayOverview";
import { listWorkspaceMembers, canWrite } from "@/lib/workspace";
import type { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIONABLE_CATEGORIES } from "@/lib/categories";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { TeamWorkload } from "@/components/equipo/TeamWorkload";
import { ActivityFeed } from "@/components/equipo/ActivityFeed";
import { StatTile } from "./StatTile";
import { SinRepartirRow } from "./SinRepartirRow";
import { TareaAccionable } from "./TareaAccionable";
import { Bloque } from "./Bloque";

const SIN_REPARTIR_LIMIT = 5;

/**
 * Inicio en modo EQUIPO: el pulso del negocio, no tu lista personal. Lo
 * primero es "qué no lleva nadie" — es el dato más accionable al repartir,
 * y aquí se resuelve sin salir de la pantalla (ver SinRepartirRow). Debajo,
 * quién lleva qué (reutiliza TeamWorkload, que hasta ahora solo vivía en
 * /equipo) y el pulso de actividad reciente.
 */
export async function TeamToday({ workspaceId, userId, role }: { workspaceId: string; userId: string; role: WorkspaceRole }) {
  const puedeEditar = canWrite(role);
  const [overview, members, sinRepartir, sinRepartirTotal] = await Promise.all([
    getTodayOverview(workspaceId),
    listWorkspaceMembers(workspaceId, userId).catch(() => []),
    prisma.message.findMany({
      where: { workspaceId, categoria: { in: [...ACTIONABLE_CATEGORIES] }, estado: { not: "HECHO" }, assigneeId: null },
      orderBy: { fecha: "desc" },
      take: SIN_REPARTIR_LIMIT,
      select: { id: true, resumen: true, categoria: true },
    }),
    prisma.message.count({
      where: { workspaceId, categoria: { in: [...ACTIONABLE_CATEGORIES] }, estado: { not: "HECHO" }, assigneeId: null },
    }),
  ]);

  const emailPorUsuario = new Map(members.map((m) => [m.userId, m.email]));
  const nadaHoy = overview.hoyEventos.length === 0 && overview.hoyTareas.length === 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          href="/pendientes?asignado=sin-asignar"
          label="Sin repartir"
          value={sinRepartirTotal}
          Icon={Inbox}
          tono={sinRepartirTotal > 0 ? "alerta" : "neutro"}
        />
        <StatTile
          href="/pendientes?vista=vencidas"
          label="Vencidas"
          value={overview.vencidasTotal}
          Icon={TriangleAlert}
          tono={overview.vencidasTotal > 0 ? "alerta" : "neutro"}
        />
        <StatTile href="/calendario" label="Hoy" value={overview.hoyTareasTotal + overview.hoyEventos.length} Icon={CalendarDays} />
        <StatTile
          href="/chat"
          label="En curso"
          value={overview.enCurso.length}
          Icon={Loader2}
          tono={overview.enCurso.length > 0 ? "bien" : "neutro"}
        />
      </div>

      {sinRepartir.length > 0 && (
        <Bloque titulo="Sin repartir" Icon={Inbox} tono="alerta" href="/pendientes?asignado=sin-asignar" hrefLabel="Ver todas">
          <ul className="flex flex-col divide-y divide-paper-line/60">
            {sinRepartir.map((t) => (
              <SinRepartirRow key={t.id} id={t.id} resumen={t.resumen} categoria={t.categoria} members={members} />
            ))}
          </ul>
          {sinRepartirTotal > sinRepartir.length && (
            <p className="text-xs text-danger/80">y {sinRepartirTotal - sinRepartir.length} más</p>
          )}
        </Bloque>
      )}

      <TeamWorkload workspaceId={workspaceId} />

      {overview.vencidasTotal > 0 && (
        <Bloque titulo="Se te ha pasado" Icon={TriangleAlert} tono="alerta" href="/pendientes?vista=vencidas" hrefLabel="Ver las vencidas">
          <ul className="flex flex-col">
            {overview.vencidas.map((t) => (
              <TareaAccionable key={t.id} id={t.id} resumen={t.resumen} categoria={t.categoria} urgente puedeEditar={puedeEditar} />
            ))}
          </ul>
        </Bloque>
      )}

      <Bloque titulo="Hoy" Icon={CalendarDays} href="/calendario">
        {nadaHoy ? (
          <p className="text-sm text-muted">Nada con fecha para hoy en el equipo.</p>
        ) : (
          <ul className="flex flex-col">
            {overview.hoyEventos.map((e) => (
              <li key={e.id} className="flex items-start gap-2 py-1 text-sm">
                <Clock aria-hidden size={14} className="mt-0.5 shrink-0 text-accent" />
                <span className="shrink-0 text-xs text-muted tabular-nums">{formatEventTime(e.fechaInicio)}</span>
                <span className="text-ink">{e.titulo}</span>
              </li>
            ))}
            {overview.hoyTareas.map((t) => (
              <TareaAccionable key={t.id} id={t.id} resumen={t.resumen} categoria={t.categoria} puedeEditar={puedeEditar} />
            ))}
          </ul>
        )}
      </Bloque>

      {overview.enCurso.length > 0 && (
        <Bloque titulo="En curso ahora" Icon={Loader2} href="/equipo" hrefLabel="Ver equipo">
          <ul className="flex flex-col gap-1.5">
            {overview.enCurso.map((t) => {
              const email = emailPorUsuario.get(t.userId);
              return (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  {email && <Avatar email={email} size="xs" />}
                  <span className="text-muted">{email ? shortEmailName(email) : "Alguien"}</span>
                  <span className="truncate text-ink">{t.resumen}</span>
                </li>
              );
            })}
          </ul>
        </Bloque>
      )}

      <ActivityFeed workspaceId={workspaceId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/chat"
          className="flex items-center gap-2 rounded-xl border border-paper-line bg-paper p-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <MessagesSquare aria-hidden size={16} className="text-accent" /> Escribir al equipo
        </Link>
        <Link
          href="/asistente"
          className="flex items-center gap-2 rounded-xl border border-paper-line bg-paper p-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <Sparkles aria-hidden size={16} className="text-accent" /> Preguntar al Asistente
        </Link>
      </div>
    </>
  );
}
