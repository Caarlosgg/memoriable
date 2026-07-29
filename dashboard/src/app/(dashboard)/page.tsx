import { Suspense } from "react";
import { CategoriesSection } from "@/components/CategoriesSection";
import { CategoriesSkeleton } from "@/components/CategoriesSkeleton";
import { PendingSection } from "@/components/PendingSection";
import { PendingSkeleton } from "@/components/PendingSkeleton";
import { SearchSection } from "@/components/SearchSection";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionErrorBoundary title="Buscador">
        <SearchSection />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Pendientes">
        <Suspense fallback={<PendingSkeleton />}>
          <PendingSection />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Categorías">
        <Suspense fallback={<CategoriesSkeleton />}>
          <CategoriesSection />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
