import type { Metadata } from "next";
import { Suspense } from "react";
import { CuentaSection } from "@/components/CuentaSection";
import { CuentaSkeleton } from "@/components/CuentaSkeleton";
import { InsightsSection } from "@/components/InsightsSection";
import { InsightsSkeleton } from "@/components/InsightsSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Cuenta · MemorIAble" };

// Sube el límite por defecto de las Server Actions de esta página — la
// importación de Markdown (ver ImportMarkdownSection.tsx) procesa varios
// ficheros en serie, cada uno con su propia llamada a la IA, y puede
// acercarse a los 10s por defecto en serverless.
export const maxDuration = 60;

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
