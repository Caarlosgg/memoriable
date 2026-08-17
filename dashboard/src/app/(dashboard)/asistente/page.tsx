import type { Metadata } from "next";
import { Suspense } from "react";
import { AssistantChat } from "@/components/AssistantChat";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Asistente · MemorIAble" };

// El estado del chat (mensajes, conversación activa, lista de conversaciones)
// vive en `AssistantProvider`, montado en el layout del dashboard — esta
// página solo renderiza la UI. Ver el comentario en AssistantProvider.tsx.
export default function AsistentePage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Aparte del chat: si falla al calcular el estado de "primeros
          pasos", eso no debe tumbar el chat en sí. `fallback={null}` porque
          no hay nada que mostrar mientras se decide si hace falta (a
          menudo no hará falta, y un skeleton parpadeando sería peor). */}
      <SectionErrorBoundary title="Primeros pasos">
        <Suspense fallback={null}>
          <OnboardingChecklist />
        </Suspense>
      </SectionErrorBoundary>
      <SectionErrorBoundary title="Asistente">
        <AssistantChat />
      </SectionErrorBoundary>
    </div>
  );
}
