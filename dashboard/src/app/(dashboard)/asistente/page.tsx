import type { Metadata } from "next";
import { AssistantChat } from "@/components/AssistantChat";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Asistente · MemorIAble" };

export default function AsistentePage() {
  return (
    <SectionErrorBoundary title="Asistente">
      <AssistantChat />
    </SectionErrorBoundary>
  );
}
