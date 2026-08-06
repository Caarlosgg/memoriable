import type { Metadata } from "next";
import { AssistantChat } from "@/components/AssistantChat";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Asistente · MemorIAble" };

// El estado del chat (mensajes, conversación activa, lista de conversaciones)
// vive en `AssistantProvider`, montado en el layout del dashboard — esta
// página solo renderiza la UI. Ver el comentario en AssistantProvider.tsx.
export default function AsistentePage() {
  return (
    <SectionErrorBoundary title="Asistente">
      <AssistantChat />
    </SectionErrorBoundary>
  );
}
