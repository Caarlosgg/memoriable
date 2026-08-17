import type { Metadata } from "next";
import { Suspense } from "react";
import { TodayView } from "@/components/inicio/TodayView";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";

export const metadata: Metadata = { title: "Inicio · MemorIAble" };

function InicioSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="skeleton h-14 w-56 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="skeleton h-32 rounded-2xl" />
    </div>
  );
}

export default function InicioPage() {
  return (
    <>
      <ActiveWorkspaceBadge />
      {/* "Primeros pasos" se muestra aquí ADEMÁS de en el Asistente: ahora
          esta es la primera pantalla, así que es donde de verdad la ve
          alguien que acaba de registrarse. Se oculta sola en cuanto tiene
          Telegram vinculado y su primera nota (ver OnboardingChecklist). */}
      <SectionErrorBoundary title="Primeros pasos">
        <Suspense fallback={null}>
          <OnboardingChecklist />
        </Suspense>
      </SectionErrorBoundary>
      <SectionErrorBoundary title="Inicio">
        <Suspense fallback={<InicioSkeleton />}>
          <TodayView />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
