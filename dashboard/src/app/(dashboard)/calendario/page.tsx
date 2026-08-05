import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { getAllEventos, getImportantPending } from "@/lib/eventos";
import { upcomingRange } from "@/lib/calendar";
import { ResumenSection } from "@/components/calendar/ResumenSection";
import { CalendarView } from "@/components/calendar/CalendarView";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Calendario · MemorIAble" };

/**
 * Sin fetch por mes al navegar: se traen TODOS los eventos del usuario de
 * una vez y `CalendarView` pagina entre meses en memoria. Proporcional al
 * uso real (app personal, no se esperan miles de eventos) — si algún día
 * hiciera falta, se pasa a traer por rango bajo demanda.
 */
async function CalendarSection() {
  const userId = await verifySession();
  const [importantPending, allEventos] = await Promise.all([getImportantPending(userId), getAllEventos(userId)]);

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
    <SectionErrorBoundary title="Calendario">
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarSection />
      </Suspense>
    </SectionErrorBoundary>
  );
}
