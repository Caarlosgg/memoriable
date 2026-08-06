import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { getCuentasConSaldo, getTendenciasPorCuenta, describeTrend } from "@/lib/ahorros";
import { AhorrosSection } from "@/components/ahorros/AhorrosSection";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Ahorros · MemorIAble" };

async function AhorrosData() {
  const userId = await verifySession();
  const [cuentas, tendencias] = await Promise.all([getCuentasConSaldo(userId), getTendenciasPorCuenta(userId)]);
  const cuentasConTendencia = cuentas.map((c) => ({
    ...c,
    tendencia: describeTrend(tendencias.get(c.id) ?? { esteMesCentimos: 0, mesAnteriorCentimos: 0 }),
  }));
  return <AhorrosSection cuentas={cuentasConTendencia} />;
}

function AhorrosSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="skeleton h-28 rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
    </div>
  );
}

export default function AhorrosPage() {
  return (
    <>
      <PageHeader
        title="Ahorros"
        help={
          <>
            Lleva el seguimiento de tus cuentas de ahorro (un fondo de emergencia, un viaje, lo que quieras).
            Apunta ingresos y retiradas aquí, o dile al Asistente cuánto has ahorrado — se registra solo, y si
            no existe la cuenta, se crea sobre la marcha.
          </>
        }
      />
      <SectionErrorBoundary title="Ahorros">
        <Suspense fallback={<AhorrosSkeleton />}>
          <AhorrosData />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
