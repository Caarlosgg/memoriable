import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardSection } from "@/components/kanban/BoardSection";
import { PendingSkeleton } from "@/components/PendingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";

export const metadata: Metadata = { title: "Tablero · MemorIAble" };

export default async function PendientesPage({
  searchParams,
}: {
  // `?vista=vencidas|hoy|mias`: lo usan las cifras de la pantalla de inicio,
  // para que pulsar "Vencidas 3" llegue al tablero YA filtrado en vez de
  // dejarte buscándolas a ojo (ver parseVista en lib/kanban.ts).
  // `?asignado=<userId>|sin-asignar`: lo usa el reparto de trabajo de
  // /equipo, para pasar de "María va cargada" a ver QUÉ lleva María.
  searchParams: Promise<{ vista?: string; asignado?: string }>;
}) {
  const { vista, asignado } = await searchParams;
  return (
    <>
      <PageHeader
        title="Tablero"
        help={
          <>
            Tus tareas y recordatorios en tres columnas: <b>Por hacer</b>, <b>En progreso</b> y <b>Hecho</b>.
            Arrastra una tarjeta para cambiarla de columna, o usa el botón de estado para avanzarla con un clic.
            Haz clic en el cuerpo de la tarjeta para ver el detalle o editarla.
          </>
        }
      />
      <ActiveWorkspaceBadge />
      <SectionErrorBoundary title="Tablero">
        <Suspense fallback={<PendingSkeleton />}>
          <BoardSection vista={vista} asignado={asignado} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
