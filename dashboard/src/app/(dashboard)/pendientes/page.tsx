import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardSection } from "@/components/kanban/BoardSection";
import { PendingSkeleton } from "@/components/PendingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Tablero · MemorIAble" };

export default function PendientesPage() {
  return (
    <SectionErrorBoundary title="Tablero">
      <Suspense fallback={<PendingSkeleton />}>
        <BoardSection />
      </Suspense>
    </SectionErrorBoundary>
  );
}
