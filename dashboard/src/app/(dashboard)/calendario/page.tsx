import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, listWorkspaceMembers, canWrite } from "@/lib/workspace";
import { getEventosEnRango, getTasksEnRango, getImportantPending } from "@/lib/eventos";
import { rangoCalendario } from "@/lib/calendar";
import { upcomingRange } from "@/lib/calendar";
import { ResumenSection } from "@/components/calendar/ResumenSection";
import { CalendarView } from "@/components/calendar/CalendarView";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";

export const metadata: Metadata = { title: "Calendario · MemorIAble" };

/**
 * Solo los meses de alrededor del actual (ver `rangoCalendario`), no el
 * historial entero: con un año de uso, "todos los eventos" son miles de
 * filas en cada carga y casi ninguna se llega a mirar. Al navegar fuera de
 * ese tramo, `CalendarView` pide el que falte con `loadCalendarRange`.
 */
async function CalendarSection({ highlightEventoId }: { highlightEventoId?: string }) {
  const userId = await verifySession();
  const { workspaceId, isPersonal, role } = await getActiveWorkspace(userId);
  // Solo los meses de alrededor, no el historial entero (ver
  // rangoCalendario): al navegar fuera, el propio calendario pide el tramo
  // que falte con `loadCalendarRange`.
  const { desde: rangoDesde, hasta: rangoHasta } = rangoCalendario(new Date());
  const [importantPending, allEventos, tareas, members] = await Promise.all([
    getImportantPending(workspaceId),
    getEventosEnRango(workspaceId, rangoDesde, rangoHasta),
    getTasksEnRango(workspaceId, rangoDesde, rangoHasta),
    // Solo hace falta en modo equipo — en personal no hay a quién asignar.
    isPersonal ? Promise.resolve([]) : listWorkspaceMembers(workspaceId, userId).catch(() => []),
  ]);

  const { desde, hasta } = upcomingRange(7);
  const upcomingEventos = allEventos.filter((e) => e.fechaInicio >= desde && e.fechaInicio < hasta);

  return (
    <>
      {allEventos.length === 0 && tareas.length === 0 && (
        <div className="rounded-xl border border-dashed border-paper-line bg-paper-raised/60 p-8 text-center">
          <p className="text-muted">
            Todavía no tienes nada con fecha. Crea un evento con el botón de arriba, ponle fecha límite a una
            tarea del tablero, o pídeselo al Asistente (&quot;quedar el jueves a las 5&quot;).
          </p>
        </div>
      )}
      <ResumenSection importantPending={importantPending} upcomingEventos={upcomingEventos} members={members} />
      <CalendarView
        eventos={allEventos}
        tareas={tareas}
        members={members}
        highlightEventoId={highlightEventoId}
        puedeEditar={canWrite(role)}
      />
    </>
  );
}

export default async function CalendarioPage({
  searchParams,
}: {
  // El aviso de "te han asignado un evento" enlaza aquí (?evento=<id>), ver
  // calendario/actions.ts y CalendarView.tsx.
  searchParams: Promise<{ evento?: string }>;
}) {
  const { evento } = await searchParams;

  return (
    <>
      <PageHeader
        title="Calendario"
        help={
          <>
            Tus citas y las tareas que vencen, juntas. Crea eventos con el botón de arriba o pídeselo al
            Asistente en lenguaje natural (&quot;quedar el jueves a las 5&quot;); las tareas con fecha límite
            aparecen solas desde el tablero, con contorno punteado y en rojo si ya han vencido. Toca un día
            para ver todo lo suyo.
          </>
        }
      />
      <ActiveWorkspaceBadge />
      <SectionErrorBoundary title="Calendario">
        <Suspense fallback={<CalendarSkeleton />}>
          <CalendarSection highlightEventoId={evento} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
