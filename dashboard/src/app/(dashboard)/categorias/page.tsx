import type { Metadata } from "next";
import { Suspense } from "react";
import { CaptureForm } from "@/components/CaptureForm";
import { NotesSection } from "@/components/NotesSection";
import { NotesSkeleton } from "@/components/NotesSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

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
      <SectionErrorBoundary title="Anotar">
        <CaptureForm />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Notas">
        <Suspense fallback={<NotesSkeleton />}>
          <NotesSection highlightId={mensaje} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
