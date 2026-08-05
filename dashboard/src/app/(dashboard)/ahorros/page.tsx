import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { getCuentasConSaldo } from "@/lib/ahorros";
import { AhorrosSection } from "@/components/ahorros/AhorrosSection";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Ahorros · MemorIAble" };

async function AhorrosData() {
  const userId = await verifySession();
  const cuentas = await getCuentasConSaldo(userId);
  return <AhorrosSection cuentas={cuentas} />;
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
    <SectionErrorBoundary title="Ahorros">
      <Suspense fallback={<AhorrosSkeleton />}>
        <AhorrosData />
      </Suspense>
    </SectionErrorBoundary>
  );
}
