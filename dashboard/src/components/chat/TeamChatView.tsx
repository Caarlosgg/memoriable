"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Send, ImagePlus, X, Circle } from "lucide-react";
import {
  listChatMessages,
  sendChatMessage,
  markChatRead,
  uploadChatImage,
  type ChatMessageView,
} from "@/app/(dashboard)/chat/actions";
import { useChatRealtime } from "@/lib/useChatRealtime";
import { useVisibilityAwarePolling } from "@/lib/useVisibilityAwarePolling";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { isOnline } from "@/lib/presence";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PresenceSelect, PRESENCE_LABEL, PRESENCE_DOT } from "./PresenceSelect";

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

/** Imagen del/miembros del/la fila de "quién está en línea" — separada de la lista de mensajes, informativa. */
function TeamPresenceStrip({ members, currentUserId }: { members: WorkspaceMemberInfo[]; currentUserId: string }) {
  const others = members.filter((m) => m.userId !== currentUserId && m.status === "ACTIVE");
  if (others.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2 rounded-xl border border-paper-line bg-paper-raised/60 p-2.5">
      {others.map((m) => {
        const online = isOnline(m.lastSeenAt);
        const status = m.presenceStatus ?? "DISPONIBLE";
        return (
          <li
            key={m.userId}
            title={`${m.email} · ${online ? "en línea" : "desconectado"} · ${PRESENCE_LABEL[status]}`}
            className="flex items-center gap-1.5 rounded-full bg-paper px-2 py-1 text-xs text-ink"
          >
            <span className="relative shrink-0">
              <Avatar email={m.email} size="xs" />
              <span
                className={`absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-paper ${online ? "bg-accent" : "bg-paper-line"}`}
              />
            </span>
            <span className="truncate">{shortEmailName(m.email)}</span>
            <Circle aria-hidden size={7} className={`${PRESENCE_DOT[status]} fill-current`} />
          </li>
        );
      })}
    </ul>
  );
}

export function TeamChatView({
  workspaceId,
  currentUserId,
  initialMessages,
  members,
}: {
  workspaceId: string;
  currentUserId: string;
  initialMessages: ChatMessageView[];
  /** Miembros del workspace activo — presencia/estado en la tira de arriba y tu propio selector. */
  members: WorkspaceMemberInfo[];
}) {
  const [messages, setMessages] = useState<PendingMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef<string | undefined>(initialMessages.at(-1)?.id);
  // Id del eco optimista todavía sin confirmar — como mucho uno a la vez
  // (el formulario se deshabilita mientras `sending`). El sondeo/Realtime
  // puede traer el mensaje real ANTES de que vuelva la propia llamada a
  // `sendChatMessage` (sobre todo con Realtime activo) — sin esta
  // correlación, los dos caminos acababan añadiendo el mensaje por
  // separado y se veía duplicado.
  const pendingIdRef = useRef<string | null>(null);

  const pollAndMerge = useCallback(async () => {
    try {
      const fresh = await listChatMessages(lastIdRef.current);
      if (fresh.length === 0) return;
      lastIdRef.current = fresh.at(-1)!.id;
      const resolvesPending = pendingIdRef.current !== null && fresh.some((m) => m.userId === currentUserId);
      const resolvedId = resolvesPending ? pendingIdRef.current : null;
      if (resolvesPending) pendingIdRef.current = null;
      setMessages((prev) => {
        const base = resolvedId ? prev.filter((m) => m.id !== resolvedId) : prev;
        return [...base, ...fresh];
      });
      // Si ya se ven en pantalla, cuentan como leídos — evita que el punto
      // de "no leído" del menú se encienda por mensajes que el usuario ya
      // tiene delante en este mismo momento.
      markChatRead().catch(() => {});
    } catch (err) {
      console.error("No se pudo actualizar el chat (no crítico, se reintenta en el siguiente sondeo):", err);
    }
  }, [currentUserId]);

  const { connected } = useChatRealtime(workspaceId, pollAndMerge);
  useVisibilityAwarePolling(pollAndMerge, connected ? SLOW_POLL_MS : FAST_POLL_MS);

  useEffect(() => {
    markChatRead().catch(() => {});
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function clearPendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if ((!trimmed && !pendingImage) || sending) return;

    setError(null);
    setSending(true);
    setInput("");
    const imageToSend = pendingImage;
    clearPendingImage();

    let imagenUrl: string | null = null;
    if (imageToSend) {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append("file", imageToSend.file);
      const uploadResult = await uploadChatImage(formData);
      setUploadingImage(false);
      if (uploadResult.error || !uploadResult.url) {
        setError(uploadResult.error || "No se ha podido subir la imagen.");
        setSending(false);
        return;
      }
      imagenUrl = uploadResult.url;
    }

    const tempId = `pending-${Date.now()}`;
    pendingIdRef.current = tempId;
    const optimistic: PendingMessage = {
      id: tempId,
      texto: trimmed,
      imagenUrl,
      createdAt: new Date().toISOString(),
      userId: currentUserId,
      email: "",
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const result = await sendChatMessage(trimmed, imagenUrl);
      if (result.error || !result.message) {
        setError(result.error || "No se ha podido enviar.");
        pendingIdRef.current = null;
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      lastIdRef.current = result.message.id;
      // Si el sondeo/Realtime ya reconoció este envío (pendingIdRef ya
      // limpio), el mensaje real ya está en la lista — no duplicarlo.
      if (pendingIdRef.current === tempId) {
        pendingIdRef.current = null;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? result.message! : m)));
      }
    } catch (err) {
      console.error("Error al enviar el mensaje de chat:", err);
      setError("No se ha podido enviar.");
      pendingIdRef.current = null;
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  const self = members.find((m) => m.userId === currentUserId);

  return (
    <section aria-label="Chat de equipo" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TeamPresenceStrip members={members} currentUserId={currentUserId} />
        <PresenceSelect current={self?.presenceStatus ?? null} />
      </div>

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
                {message.imagenUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL externa (Vercel Blob), no una ruta estática local
                  <img
                    src={message.imagenUrl}
                    alt="Imagen adjunta"
                    className={`max-h-64 rounded-2xl object-cover ${message.pending ? "opacity-60" : ""}`}
                  />
                )}
                {message.texto && (
                  <div
                    className={
                      isSelf
                        ? `rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-ink ${message.pending ? "opacity-60" : ""}`
                        : "rounded-2xl rounded-bl-sm border border-paper-line bg-paper px-3.5 py-2 text-sm text-ink"
                    }
                  >
                    {message.texto}
                  </div>
                )}
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {pendingImage && (
          <div className="flex items-center gap-2 rounded-lg border border-paper-line bg-paper p-2 text-xs text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob: URL), no cabe en next/image */}
            <img src={pendingImage.previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
            <span className="flex-1 truncate">{pendingImage.file.name}</span>
            <button
              type="button"
              onClick={clearPendingImage}
              aria-label="Quitar imagen"
              className="rounded-full p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <X aria-hidden size={14} />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Escribe un mensaje para el equipo
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Adjuntar imagen"
          >
            <ImagePlus aria-hidden size={16} />
          </Button>
          <Input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje…"
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" disabled={sending || (input.trim() === "" && !pendingImage)}>
            {sending ? (uploadingImage ? "Subiendo…" : "…") : <Send aria-hidden size={16} />}
            <span className="sr-only sm:not-sr-only">Enviar</span>
          </Button>
        </div>
      </form>
    </section>
  );
}
