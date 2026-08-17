"use client";

import { useState } from "react";
import { listChatMessages, listConversations, markConversationRead, type ChatMessageView, type ConversationView } from "@/app/(dashboard)/chat/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { MessageCircle } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";

/**
 * Contenedor con estado de /chat: dos paneles en escritorio (lista +
 * hilo), uno solo en móvil que alterna entre los dos (`mobileView`) — como
 * cualquier gestor de mensajería. La lista de conversaciones y los
 * mensajes del hilo activo son estado del CLIENTE (llegan ya cargados del
 * servidor, pero cambiar de conversación o crear una nueva no debe
 * recargar la página entera).
 */
export function ChatShell({
  initialConversations,
  initialSelectedId,
  initialMessages,
  members,
  currentUserId,
}: {
  initialConversations: ConversationView[];
  initialSelectedId: string | null;
  initialMessages: ChatMessageView[];
  members: WorkspaceMemberInfo[];
  currentUserId: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [messages, setMessages] = useState(initialMessages);
  const [loading, setLoading] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">(initialSelectedId ? "thread" : "list");

  async function selectConversation(id: string) {
    setSelectedId(id);
    setMobileView("thread");
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
    if (id === selectedId) return;
    setLoading(true);
    try {
      const fresh = await listChatMessages(id);
      setMessages(fresh);
    } catch (err) {
      console.error("No se pudo cargar la conversación:", err);
    } finally {
      setLoading(false);
    }
    markConversationRead(id).catch(() => {});
  }

  async function handleCreated(id: string) {
    try {
      const fresh = await listConversations();
      setConversations(fresh);
    } catch (err) {
      console.error("No se pudo actualizar la lista de conversaciones:", err);
    }
    await selectConversation(id);
  }

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:h-[calc(100vh-14rem)] md:flex-row">
      <div className={`min-h-0 flex-col rounded-2xl border border-paper-line bg-paper-raised/60 p-3 md:flex md:w-72 md:shrink-0 ${mobileView === "list" ? "flex" : "hidden"}`}>
        <ConversationList
          conversations={conversations}
          activeId={selectedId}
          members={members}
          currentUserId={currentUserId}
          onSelect={selectConversation}
          onCreated={handleCreated}
        />
      </div>
      <div className={`min-h-0 min-w-0 flex-1 md:flex ${mobileView === "thread" ? "flex" : "hidden"}`}>
        {!selectedConversation ? (
          <div className="m-auto flex flex-col items-center gap-2 text-center text-sm text-muted">
            <MessageCircle aria-hidden size={28} className="text-paper-line" />
            Elige una conversación, o crea una nueva con el botón +.
          </div>
        ) : loading ? (
          <div className="m-auto text-sm text-muted">Cargando…</div>
        ) : (
          <ConversationThread
            key={selectedConversation.id}
            conversation={selectedConversation}
            currentUserId={currentUserId}
            initialMessages={messages}
            members={members}
            onBack={() => setMobileView("list")}
          />
        )}
      </div>
    </div>
  );
}
