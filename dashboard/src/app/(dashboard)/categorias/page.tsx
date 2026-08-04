import type { Metadata } from "next";
import { Suspense } from "react";
import { CaptureForm } from "@/components/CaptureForm";
import { CategoriesSection } from "@/components/CategoriesSection";
import { CategoriesSkeleton } from "@/components/CategoriesSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Categorías · MemorIAble" };

export default async function CategoriasPage({
  searchParams,
}: {
  // El Asistente enlaza aquí a la nota real que cita (?mensaje=<id>), ver
  // AssistantChat.tsx y CategoriesSection.tsx.
  searchParams: Promise<{ mensaje?: string }>;
}) {
  const { mensaje } = await searchParams;

  return (
    <>
      <SectionErrorBoundary title="Anotar">
        <CaptureForm />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Categorías">
        <Suspense fallback={<CategoriesSkeleton />}>
          <CategoriesSection highlightId={mensaje} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
