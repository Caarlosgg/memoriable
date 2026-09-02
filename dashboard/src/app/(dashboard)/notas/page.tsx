import type { Metadata } from "next";
import { Suspense } from "react";
import { CaptureForm } from "@/components/CaptureForm";
import { NotesSection } from "@/components/NotesSection";
import { NotesSkeleton } from "@/components/NotesSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";
import { isVoiceConfigured } from "@/lib/transcriber";

export const metadata: Metadata = { title: "Notas · MemorIAble" };

export default async function NotasPage({
  searchParams,
}: {
  // El Asistente enlaza aquí a la nota real que cita (?mensaje=<id>), ver
  // AssistantChat.tsx y NotesExplorer.tsx.
  searchParams: Promise<{ mensaje?: string }>;
}) {
  const { mensaje } = await searchParams;

  return (
    <>
      <PageHeader
        title="Notas"
        help={
          <>
            Anota ideas, tareas, preguntas o recordatorios en lenguaje natural — la propia IA los categoriza
            solos, sin que tengas que elegir nada. Haz clic en una tarjeta para ver el detalle o editarla, y usa
            los filtros de arriba para buscar por categoría, prioridad o etiqueta.
          </>
        }
      />
      <ActiveWorkspaceBadge />
      <SectionErrorBoundary title="Anotar">
        <CaptureForm puedeGrabar={isVoiceConfigured()} />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Notas">
        <Suspense fallback={<NotesSkeleton />}>
          <NotesSection highlightId={mensaje} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
