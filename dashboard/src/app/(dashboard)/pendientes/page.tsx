import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardSection } from "@/components/kanban/BoardSection";
import { PendingSkeleton } from "@/components/PendingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";

export const metadata: Metadata = { title: "Tablero · MemorIAble" };

export default function PendientesPage() {
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
          <BoardSection />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
