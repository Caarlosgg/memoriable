import type { Metadata } from "next";
import { Suspense } from "react";
import { CaptureForm } from "@/components/CaptureForm";
import { CategoriesSection } from "@/components/CategoriesSection";
import { CategoriesSkeleton } from "@/components/CategoriesSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Categorías · MemorIAble" };

export default function CategoriasPage() {
  return (
    <>
      <SectionErrorBoundary title="Anotar">
        <CaptureForm />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Categorías">
        <Suspense fallback={<CategoriesSkeleton />}>
          <CategoriesSection />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
