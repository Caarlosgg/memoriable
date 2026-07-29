import { Suspense } from "react";
import { CategoriesSection } from "@/components/CategoriesSection";
import { CategoriesSkeleton } from "@/components/CategoriesSkeleton";
import { SearchSection } from "@/components/SearchSection";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <SearchSection />

      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesSection />
      </Suspense>
    </div>
  );
}
