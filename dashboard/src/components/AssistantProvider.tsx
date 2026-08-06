"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage, InferUITools, UIDataTypes } from "ai";
import type { AssistantSource } from "@/lib/assistantContext";
import type { AssistantTools } from "@/lib/assistantTools";
import type { AssistantExchangeRecord, ConversationSummary } from "@/lib/assistantHistory";
import { titleFromQuestion } from "@/lib/conversationTitle";
import { loadConversation, listMyConversations } from "@/app/(dashboard)/asistente/actions";

export type AssistantMessage = UIMessage<
  { sources?: AssistantSource[]; conversationId?: string },
  UIDataTypes,
  InferUITools<AssistantTools>
>;

/**
 * Reconstruye los intercambios guardados de una conversación como la
 * secuencia de mensajes que `useChat` espera, en orden. No lleva
 * `metadata.sources`: el historial solo guarda pregunta+respuesta en
 * texto, no qué notas se usaron — al recuperarlo no se muestra el
 * desplegable de fuentes (aceptable: son respuestas ya dadas).
 */
function exchangesToMessages(exchanges: AssistantExchangeRecord[]): AssistantMessage[] {
  return exchanges.flatMap((exchange) => [
    { id: `${exchange.id}-q`, role: "user" as const, parts: [{ type: "text" as const, text: exchange.pregunta }] },
    { id: `${exchange.id}-a`, role: "assistant" as const, parts: [{ type: "text" as const, text: exchange.respuesta }] },
  ]);
}

interface AssistantContextValue {
  messages: AssistantMessage[];
  isBusy: boolean;
  error: Error | undefined;
  clearError: () => void;
  conversationId: string;
  conversations: ConversationSummary[];
  input: string;
  setInput: (value: string) => void;
  handleSend: (text: string) => void;
  handleNewConversation: () => void;
  handleSelectConversation: (id: string) => Promise<void>;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant debe usarse dentro de <AssistantProvider>.");
  return ctx;
}

/**
 * El estado del chat (useChat, conversación activa, lista de
 * conversaciones) vive AQUÍ, montado en el layout del dashboard — no en
 * la página /asistente. Next.js desmonta lo que no vive en un layout
 * compartido al navegar entre rutas: si `useChat` viviera en la propia
 * página /asistente, salir de ella mientras el Asistente sigue
 * respondiendo cortaría la petición en marcha. Con el estado aquí, la
 * respuesta sigue llegando en segundo plano mientras se navega por el
 * resto del dashboard, y al volver a /asistente ya está — como un chat de
 * verdad, no como una pestaña que se cierra sola.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  // La pregunta que se acaba de mandar: se usa para titular la conversación
  // localmente en cuanto la respuesta termina, sin esperar a recargar.
  const pendingQuestionRef = useRef("");

  useEffect(() => {
    listMyConversations()
      .then(setConversations)
      .catch((err) => console.error("No se pudieron cargar las conversaciones del Asistente:", err));
  }, []);

  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat<AssistantMessage>({
    transport: new DefaultChatTransport({ api: "/api/asistente", body: { conversationId } }),
    onFinish: ({ message }) => {
      const savedId = message.metadata?.conversationId ?? conversationId;
      const question = pendingQuestionRef.current;
      if (!question) return;

      setConversations((prev) => {
        const rest = prev.filter((c) => c.id !== savedId);
        const existing = prev.find((c) => c.id === savedId);
        return [
          { id: savedId, titulo: existing?.titulo ?? titleFromQuestion(question), updatedAt: new Date() },
          ...rest,
        ];
      });
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  // Red de seguridad: si una respuesta se queda colgada (verificado en vivo
  // que puede pasar con peticiones lentas) sin llegar nunca a un estado
  // final, el chat quedaba bloqueado para siempre — "no me deja enviar
  // mensajes" sin ningún error visible, solo un reinicio de página lo
  // arreglaba. Pasado este margen se corta la petición sola y se libera el
  // chat, con un error visible en vez de un bloqueo silencioso.
  const STUCK_TIMEOUT_MS = 45_000;
  useEffect(() => {
    if (!isBusy) return;
    const timer = setTimeout(() => stop(), STUCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isBusy, stop]);

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (trimmed === "" || isBusy) return;
    clearError();
    pendingQuestionRef.current = trimmed;
    sendMessage({ text: trimmed });
    setInput("");
  }

  function handleNewConversation() {
    setConversationId(crypto.randomUUID());
    setMessages([]);
    clearError();
  }

  async function handleSelectConversation(id: string) {
    if (id === conversationId) return;
    clearError();
    const exchanges = await loadConversation(id);
    setConversationId(id);
    setMessages(exchangesToMessages(exchanges));
  }

  return (
    <AssistantContext.Provider
      value={{
        messages,
        isBusy,
        error,
        clearError,
        conversationId,
        conversations,
        input,
        setInput,
        handleSend,
        handleNewConversation,
        handleSelectConversation,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}
