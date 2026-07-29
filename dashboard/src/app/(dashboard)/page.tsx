import { Suspense } from "react";
import { CategoriesSection } from "@/components/CategoriesSection";
import { CategoriesSkeleton } from "@/components/CategoriesSkeleton";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesSection />
      </Suspense>
    </div>
  );
}
