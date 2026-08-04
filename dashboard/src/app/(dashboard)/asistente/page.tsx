import type { Metadata } from "next";
import { AssistantChat } from "@/components/AssistantChat";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { verifySession } from "@/lib/dal";
import { getRecentExchanges } from "@/lib/assistantHistory";
import { groupExchangesByDay } from "@/lib/groupExchangesByDay";

export const metadata: Metadata = { title: "Asistente · MemorIAble" };

export default async function AsistentePage() {
  const userId = await verifySession();

  // El historial es un extra, no algo crítico para poder chatear: si falla
  // (p. ej. la tabla aún no existe, o un problema puntual de conexión), el
  // Asistente sigue funcionando igual, solo que sin historial reciente.
  let initialHistory: ReturnType<typeof groupExchangesByDay> = [];
  try {
    initialHistory = groupExchangesByDay(await getRecentExchanges(userId));
  } catch (err) {
    console.error("No se pudo cargar el historial del Asistente:", err);
  }

  return (
    <SectionErrorBoundary title="Asistente">
      <AssistantChat initialHistory={initialHistory} />
    </SectionErrorBoundary>
  );
}
