import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, listWorkspaceMembers } from "@/lib/workspace";
import { getAllEventos, getImportantPending, getTasksWithDeadline } from "@/lib/eventos";
import { upcomingRange } from "@/lib/calendar";
import { ResumenSection } from "@/components/calendar/ResumenSection";
import { CalendarView } from "@/components/calendar/CalendarView";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";

export const metadata: Metadata = { title: "Calendario · MemorIAble" };

/**
 * Sin fetch por mes al navegar: se traen TODOS los eventos del usuario de
 * una vez y `CalendarView` pagina entre meses en memoria. Proporcional al
 * uso real (app personal, no se esperan miles de eventos) — si algún día
 * hiciera falta, se pasa a traer por rango bajo demanda.
 */
async function CalendarSection({ highlightEventoId }: { highlightEventoId?: string }) {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);
  const [importantPending, allEventos, tareas, members] = await Promise.all([
    getImportantPending(workspaceId),
    getAllEventos(workspaceId),
    getTasksWithDeadline(workspaceId),
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
      <CalendarView eventos={allEventos} tareas={tareas} members={members} highlightEventoId={highlightEventoId} />
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
