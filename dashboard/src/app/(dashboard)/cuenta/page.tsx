import type { Metadata } from "next";
import { Suspense } from "react";
import { CuentaSection } from "@/components/CuentaSection";
import { CuentaSkeleton } from "@/components/CuentaSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Cuenta · MemorIAble" };

export default function CuentaPage() {
  return (
    <SectionErrorBoundary title="Cuenta">
      <Suspense fallback={<CuentaSkeleton />}>
        <CuentaSection />
      </Suspense>
    </SectionErrorBoundary>
  );
}
