import type { Metadata } from "next";
import { Suspense } from "react";
import { CuentaSection } from "@/components/CuentaSection";
import { CuentaSkeleton } from "@/components/CuentaSkeleton";
import { InsightsSection } from "@/components/InsightsSection";
import { InsightsSkeleton } from "@/components/InsightsSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Cuenta · MemorIAble" };

export default function CuentaPage() {
  return (
    <>
      <PageHeader
        title="Cuenta"
        help={
          <>
            Tus preferencias (tema, tamaño de texto), el enlace con tu chat de Telegram, y un resumen de tu
            actividad reciente. Desde aquí también puedes exportar todos tus datos.
          </>
        }
      />
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
