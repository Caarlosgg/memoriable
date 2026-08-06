import type { Metadata } from "next";
import { Suspense } from "react";
import { CuentaSection } from "@/components/CuentaSection";
import { CuentaSkeleton } from "@/components/CuentaSkeleton";
import { InsightsSection } from "@/components/InsightsSection";
import { InsightsSkeleton } from "@/components/InsightsSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Cuenta · MemorIAble" };

export default function CuentaPage() {
  return (
    <>
      <SectionErrorBoundary title="Cuenta">
        <Suspense fallback={<CuentaSkeleton />}>
          <CuentaSection />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Tu actividad">
        <Suspense fallback={<InsightsSkeleton />}>
          <InsightsSection />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
