import type { Metadata } from "next";
import { SearchSection } from "@/components/SearchSection";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Buscador · MemorIAble" };

export default function BuscadorPage() {
  return (
    <SectionErrorBoundary title="Buscador">
      <SearchSection />
    </SectionErrorBoundary>
  );
}
