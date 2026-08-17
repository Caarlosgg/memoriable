"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { listChatMessages, sendChatMessage, markChatRead, type ChatMessageView } from "@/app/(dashboard)/chat/actions";
import { useChatRealtime } from "@/lib/useChatRealtime";
import { useVisibilityAwarePolling } from "@/lib/useVisibilityAwarePolling";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Sondeo de RESPALDO, no la vía principal cuando Realtime está configurado
// (ver useChatRealtime.ts) — cubre huecos de reconexión del WebSocket y,
// sin `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` puestas, es la ÚNICA vía: en
// ese caso se sondea más seguido para que el chat se siga sintiendo ágil.
const FAST_POLL_MS = 4000;
const SLOW_POLL_MS = 20000;

/** Mensaje que aún no ha confirmado el servidor — eco local optimista al enviar. */
interface PendingMessage extends ChatMessageView {
  pending?: boolean;
}

export function TeamChatView({
  workspaceId,
  currentUserId,
  initialMessages,
}: {
  workspaceId: string;
  currentUserId: string;
  initialMessages: ChatMessageView[];
}) {
  const [messages, setMessages] = useState<PendingMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lastIdRef = useRef<string | undefined>(initialMessages.at(-1)?.id);

  const pollAndMerge = useCallback(async () => {
    try {
      const fresh = await listChatMessages(lastIdRef.current);
      if (fresh.length === 0) return;
      lastIdRef.current = fresh.at(-1)!.id;
      setMessages((prev) => [...prev.filter((m) => !m.pending), ...fresh]);
      // Si ya se ven en pantalla, cuentan como leídos — evita que el punto
      // de "no leído" del menú se encienda por mensajes que el usuario ya
      // tiene delante en este mismo momento.
      markChatRead().catch(() => {});
    } catch (err) {
      console.error("No se pudo actualizar el chat (no crítico, se reintenta en el siguiente sondeo):", err);
    }
  }, []);

  const { connected } = useChatRealtime(workspaceId, pollAndMerge);
  useVisibilityAwarePolling(pollAndMerge, connected ? SLOW_POLL_MS : FAST_POLL_MS);

  useEffect(() => {
    markChatRead().catch(() => {});
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setError(null);
    setSending(true);
    setInput("");
    const tempId = `pending-${Date.now()}`;
    const optimistic: PendingMessage = {
      id: tempId,
      texto: trimmed,
      createdAt: new Date().toISOString(),
      userId: currentUserId,
      email: "",
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const result = await sendChatMessage(trimmed);
      if (result.error || !result.message) {
        setError(result.error || "No se ha podido enviar.");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      lastIdRef.current = result.message.id;
      setMessages((prev) => prev.map((m) => (m.id === tempId ? result.message! : m)));
    } catch (err) {
      console.error("Error al enviar el mensaje de chat:", err);
      setError("No se ha podido enviar.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Chat de equipo" className="flex min-h-0 flex-1 flex-col gap-3">
      <ul ref={listRef} className="flex min-h-[50vh] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-paper-line bg-paper-raised p-4">
        {messages.length === 0 && (
          <li className="m-auto text-center text-sm text-muted">
            Todavía no hay mensajes — escribe el primero.
          </li>
        )}
        {messages.map((message) => {
          const isSelf = message.userId === currentUserId;
          return (
            <li key={message.id} className={isSelf ? "flex justify-end" : "flex items-end gap-2"}>
              {!isSelf && <Avatar email={message.email} size="sm" />}
              <div className="flex max-w-[75%] flex-col gap-0.5">
                {!isSelf && (
                  <span className="text-[11px] font-medium text-muted">{shortEmailName(message.email)}</span>
                )}
                <div
                  className={
                    isSelf
                      ? `rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-ink ${message.pending ? "opacity-60" : ""}`
                      : "rounded-2xl rounded-bl-sm border border-paper-line bg-paper px-3.5 py-2 text-sm text-ink"
                  }
                >
                  {message.texto}
                </div>
                <span className={`text-[10px] text-muted ${isSelf ? "text-right" : ""}`}>
                  {formatEventTime(message.createdAt)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Escribe un mensaje para el equipo
        </label>
        <Input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un mensaje…"
          disabled={sending}
          className="flex-1"
        />
        <Button type="submit" disabled={sending || input.trim() === ""}>
          <Send aria-hidden size={16} />
          <span className="sr-only sm:not-sr-only">Enviar</span>
        </Button>
      </form>
    </section>
  );
}
