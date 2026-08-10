import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { getAllEventos, getImportantPending } from "@/lib/eventos";
import { upcomingRange } from "@/lib/calendar";
import { ResumenSection } from "@/components/calendar/ResumenSection";
import { CalendarView } from "@/components/calendar/CalendarView";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Calendario · MemorIAble" };

/**
 * Sin fetch por mes al navegar: se traen TODOS los eventos del usuario de
 * una vez y `CalendarView` pagina entre meses en memoria. Proporcional al
 * uso real (app personal, no se esperan miles de eventos) — si algún día
 * hiciera falta, se pasa a traer por rango bajo demanda.
 */
async function CalendarSection() {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const [importantPending, allEventos] = await Promise.all([
    getImportantPending(workspaceId),
    getAllEventos(workspaceId),
  ]);

  const { desde, hasta } = upcomingRange(7);
  const upcomingEventos = allEventos.filter((e) => e.fechaInicio >= desde && e.fechaInicio < hasta);

  return (
    <>
      <ResumenSection importantPending={importantPending} upcomingEventos={upcomingEventos} />
      <CalendarView eventos={allEventos} />
    </>
  );
}

export default function CalendarioPage() {
  return (
    <>
      <PageHeader
        title="Calendario"
        help={
          <>
            Tus citas y eventos con fecha y hora. Créalos aquí con el botón de nuevo evento, o pídeselo al
            Asistente en lenguaje natural (&quot;quedar el jueves a las 5&quot;). Haz clic en un día o en un
            evento para ver el detalle.
          </>
        }
      />
      <SectionErrorBoundary title="Calendario">
        <Suspense fallback={<CalendarSkeleton />}>
          <CalendarSection />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
