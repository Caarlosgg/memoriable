import type { Metadata } from "next";
import { Suspense } from "react";
import { PendingSection } from "@/components/PendingSection";
import { PendingSkeleton } from "@/components/PendingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Pendientes · MemorIAble" };

export default function PendientesPage() {
  return (
    <SectionErrorBoundary title="Pendientes">
      <Suspense fallback={<PendingSkeleton />}>
        <PendingSection />
      </Suspense>
    </SectionErrorBoundary>
  );
}
