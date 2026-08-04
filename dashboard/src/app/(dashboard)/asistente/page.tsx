import type { Metadata } from "next";
import { AssistantChat } from "@/components/AssistantChat";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { verifySession } from "@/lib/dal";
import { listConversations, type ConversationSummary } from "@/lib/assistantHistory";

export const metadata: Metadata = { title: "Asistente · MemorIAble" };

export default async function AsistentePage() {
  const userId = await verifySession();

  // El historial es un extra, no algo crítico para poder chatear: si falla
  // (p. ej. un problema puntual de conexión), el Asistente sigue
  // funcionando igual, solo que sin la lista de conversaciones anteriores.
  let initialConversations: ConversationSummary[] = [];
  try {
    initialConversations = await listConversations(userId);
  } catch (err) {
    console.error("No se pudieron cargar las conversaciones del Asistente:", err);
  }

  return (
    <SectionErrorBoundary title="Asistente">
      <AssistantChat initialConversations={initialConversations} />
    </SectionErrorBoundary>
  );
}
