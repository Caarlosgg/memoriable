"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import {
  ArrowLeft,
  Send,
  ImagePlus,
  X,
  Bell,
  BellOff,
  Users,
  Trash2,
  Search,
} from "lucide-react";
import {
  listChatMessages,
  sendChatMessage,
  markConversationRead,
  uploadChatImage,
  setConversationMuted,
  deleteChatMessage,
  searchChatMessages,
  type ChatMessageView,
  type ConversationView,
} from "@/app/(dashboard)/chat/actions";
import { useChatRealtime } from "@/lib/useChatRealtime";
import { useVisibilityAwarePolling } from "@/lib/useVisibilityAwarePolling";
import { isOnline } from "@/lib/presence";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { textoVisto } from "@/lib/chatReadReceipt";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PresenceSelect, PRESENCE_LABEL } from "./PresenceSelect";
import { ConversationInfoDialog } from "./ConversationInfoDialog";

// Sondeo de RESPALDO, no la vía principal cuando Realtime está configurado
// (ver useChatRealtime.ts) — cubre huecos de reconexión del WebSocket y,
// sin `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` puestas, es la ÚNICA vía: en
// ese caso se sondea más seguido para que el chat se siga sintiendo ágil.
const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 20000;
// Cuánto se mantiene visible "X está escribiendo…" tras el último aviso —
// no hay evento explícito de "he dejado de escribir", así que se infiere
// por ausencia: si no llega otro aviso en este margen, se apaga solo.
const TYPING_EXPIRY_MS = 3000;
// No reenviar el aviso de "escribiendo" en cada pulsación — de sobra con
// una vez cada 2s mientras se sigue escribiendo.
const TYPING_THROTTLE_MS = 2000;

/** Mensaje que aún no ha confirmado el servidor — eco local optimista al enviar. */
interface PendingMessage extends ChatMessageView {
  pending?: boolean;
}

/**
 * Hilo de UNA conversación (individual o grupo) — antes era el chat entero
 * del workspace (`TeamChatView`); ahora `conversationId` decide cuál se
 * pinta, y todo lo demás (optimista, Realtime, sondeo de respaldo,
 * "escribiendo…") es exactamente el mismo mecanismo de antes.
 */
export function ConversationThread({
  conversation,
  currentUserId,
  initialMessages,
  onBack,
  onConversationChanged,
  onLeft,
  puedeAdjuntar,
}: {
  conversation: ConversationView;
  currentUserId: string;
  initialMessages: ChatMessageView[];
  /** Solo en móvil: volver a la lista de conversaciones sin perder el sitio. */
  onBack?: () => void;
  /** Han cambiado los participantes — la lista de conversaciones debe releerse. */
  onConversationChanged: () => void;
  /** Ha salido del grupo: ya no pertenece a esta conversación. */
  onLeft: () => void;
  /** El servidor tiene configurado Vercel Blob — si no, no se ofrece adjuntar (ver isBlobConfigured). */
  puedeAdjuntar: boolean;
}) {
  const conversationId = conversation.id;
  const [messages, setMessages] = useState<PendingMessage[]>(initialMessages);
  const [muted, setMuted] = useState(conversation.muted);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
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
  const [typingEmail, setTypingEmail] = useState<string | null>(null);
  // Buscador dentro de la conversación. `null` = cerrado; "" = abierto y
  // vacío. Se distingue para que abrirlo no dispare ya una búsqueda ni
  // tape el hilo hasta que de verdad se escriba algo.
  const [busqueda, setBusqueda] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ChatMessageView[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const typingExpiryRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastTypingSentAtRef = useRef(0);

  const pollAndMerge = useCallback(async () => {
    try {
      const fresh = await listChatMessages(conversationId, lastIdRef.current);
      if (fresh.length === 0) return;
      lastIdRef.current = fresh.at(-1)!.id;
      const resolvesPending =
        pendingIdRef.current !== null &&
        fresh.some((m) => m.userId === currentUserId);
      const resolvedId = resolvesPending ? pendingIdRef.current : null;
      if (resolvesPending) pendingIdRef.current = null;
      setMessages((prev) => {
        // El aviso de Realtime y el sondeo de respaldo pueden solaparse (p.
        // ej. justo al enviar: llega el broadcast Y, unos segundos después,
        // toca el sondeo periódico) — dos llamadas a `pollAndMerge` en
        // vuelo a la vez pueden traer el MISMO `fresh` dos veces. Filtrar
        // `prev` por los ids que ya vienen en `fresh` (además del propio
        // eco optimista) hace la fusión idempotente sin importar cuántas
        // veces se solape.
        const freshIds = new Set(fresh.map((m) => m.id));
        const base = prev.filter(
          (m) => m.id !== resolvedId && !freshIds.has(m.id),
        );
        return [...base, ...fresh];
      });
      // Si ya se ven en pantalla, cuentan como leídos — evita que el punto
      // de "no leído" del menú se encienda por mensajes que el usuario ya
      // tiene delante en este mismo momento.
      markConversationRead(conversationId).catch(() => {});
    } catch (err) {
      console.error(
        "No se pudo actualizar el chat (no crítico, se reintenta en el siguiente sondeo):",
        err,
      );
    }
  }, [currentUserId, conversationId]);

  const handleTyping = useCallback(
    ({ userId, email }: { userId: string; email: string }) => {
      if (userId === currentUserId) return;
      setTypingEmail(email);
      clearTimeout(typingExpiryRef.current);
      typingExpiryRef.current = setTimeout(
        () => setTypingEmail(null),
        TYPING_EXPIRY_MS,
      );
    },
    [currentUserId],
  );
  const { connected, sendTyping } = useChatRealtime(
    conversationId,
    pollAndMerge,
    handleTyping,
  );
  useVisibilityAwarePolling(
    pollAndMerge,
    connected ? SLOW_POLL_MS : FAST_POLL_MS,
  );

  useEffect(() => () => clearTimeout(typingExpiryRef.current), []);

  const self = conversation.participants.find(
    (p) => p.userId === currentUserId,
  );
  const selfEmail = self?.email ?? "";
  const other =
    conversation.type === "DIRECT"
      ? conversation.participants.find(
          (p) => p.userId === conversation.otherUserId,
        )
      : undefined;

  function handleInputChange(value: string) {
    setInput(value);
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentAtRef.current = now;
    sendTyping({ userId: currentUserId, email: selfEmail });
  }

  useEffect(() => {
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  /**
   * Borrado optimista: desaparece al instante y, si el servidor lo
   * rechaza, vuelve a su sitio. Lo mismo que hace el resto de la app con
   * las tarjetas del tablero — esperar a la confirmación para quitarlo de
   * pantalla se nota lento en algo tan inmediato como un chat.
   */
  async function handleDeleteMessage(messageId: string) {
    const snapshot = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    const result = await deleteChatMessage(messageId);
    if (result.error) {
      setError(result.error);
      setMessages(snapshot);
    }
  }

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

  /**
   * Pegar una captura de pantalla (Ctrl+V) adjunta la imagen igual que
   * elegirla por el botón — mismo patrón que MessageDetailDialog.tsx.
   * Silencioso si no hay imagen en el portapapeles: es lo normal al pegar
   * texto en el campo, no un error.
   */
  function handlePaste(e: ClipboardEvent<HTMLFormElement>) {
    const item = Array.from(e.clipboardData.items).find((it) =>
      it.type.startsWith("image/"),
    );
    if (!item) return;
    // Pegar una imagen con el almacenamiento sin configurar tiene que
    // DECIRLO. Callar aquí es lo que hacía que pegar una captura pareciera
    // que la aplicación se la tragaba sin más.
    if (!puedeAdjuntar) {
      e.preventDefault();
      setError(
        "Adjuntar imágenes no está configurado en este servidor (falta BLOB_READ_WRITE_TOKEN).",
      );
      return;
    }
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
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
      const uploadResult = await uploadChatImage(formData, conversationId);
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
      const result = await sendChatMessage(conversationId, trimmed, imagenUrl);
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
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? result.message! : m)),
        );
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

  const headerTitle =
    conversation.type === "GROUP"
      ? conversation.nombre
      : shortEmailName(conversation.nombre);
  const participantCount = conversation.participants.length;
  const headerSubtitle =
    conversation.type === "GROUP"
      ? // Con el nombre del equipo delante cuando es su grupo automático:
        // varios equipos tienen un grupo llamado igual ("Equipo").
        `${conversation.equipo ? `${conversation.equipo} · ` : ""}${participantCount} ${participantCount === 1 ? "persona" : "personas"}`
      : other
        ? `${isOnline(other.lastSeenAt) ? "en línea" : "desconectado"} · ${PRESENCE_LABEL[other.presenceStatus ?? "DISPONIBLE"]}`
        : undefined;

  // "Hay búsqueda en marcha" se DERIVA del texto, no se guarda: con menos
  // de dos letras (o con el buscador cerrado) simplemente se vuelve a
  // enseñar el hilo, sin tener que acordarse de limpiar nada por el camino.
  const termino = busqueda?.trim() ?? "";
  const busquedaActiva = termino.length >= 2;

  // Busca en el servidor con un respiro entre teclas, para no lanzar una
  // consulta por carácter. Mismo patrón (y mismo mínimo de 2 letras) que
  // UserSearchPicker.
  useEffect(() => {
    if (!busquedaActiva) return;
    // El aviso de "Buscando…" se enciende ANTES de lanzar la petición para
    // que no se queden a la vista los resultados de la búsqueda anterior
    // mientras llega la nueva. El linter marca esto por sistema, pero es el
    // caso que él mismo describe como válido (avisar a la interfaz del
    // último estado), no un cálculo derivable — ver el mismo comentario en
    // UserSearchPicker.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuscando(true);
    const timer = setTimeout(() => {
      searchChatMessages(conversationId, termino)
        .then(setResultados)
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [termino, busquedaActiva, conversationId]);

  // Lo que se pinta en la lista: los resultados si hay búsqueda en curso, y
  // si no el hilo normal. Un único sitio decide, para que el resto del
  // render no tenga que saber en qué modo está.
  const mostrandoResultados = busquedaActiva && resultados !== null;
  const visibles: PendingMessage[] =
    mostrandoResultados && resultados ? resultados : messages;

  // El acuse va SOLO bajo el último mensaje propio ya confirmado. Repetirlo
  // en cada burbuja llenaría el hilo de "Visto" sin aportar nada: lo que se
  // quiere saber es si la otra persona está al día, y eso lo responde el
  // último. Los pendientes quedan fuera porque todavía no existen para
  // nadie más.
  const ultimoPropioId = messages.findLast(
    (m) => m.userId === currentUserId && !m.pending,
  )?.id;

  return (
    <section
      aria-label={`Conversación: ${headerTitle}`}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver a conversaciones"
              className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-paper-line/60 hover:text-ink md:hidden"
            >
              <ArrowLeft aria-hidden size={18} />
            </button>
          )}
          {/* La cabecera entera abre la ficha (quién está dentro, añadir
              gente, salir del grupo) — mismo gesto que en cualquier app de
              mensajería, sin un botón extra compitiendo por el sitio. */}
          <ConversationInfoDialog
            conversation={conversation}
            currentUserId={currentUserId}
            onChanged={onConversationChanged}
            onLeft={onLeft}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-paper-line/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              {conversation.type === "GROUP" ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                  <Users aria-hidden size={14} />
                </span>
              ) : (
                <Avatar email={other?.email ?? headerTitle} size="sm" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {headerTitle}
                </p>
                {headerSubtitle && (
                  <p className="truncate text-xs text-muted">
                    {headerSubtitle}
                  </p>
                )}
              </div>
            </button>
          </ConversationInfoDialog>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setBusqueda((prev) => {
                // Al cerrar se tiran los resultados: si no, volver a abrir
                // el buscador enseñaría la búsqueda anterior como si fuera
                // el hilo.
                if (prev !== null) setResultados(null);
                return prev === null ? "" : null;
              })
            }
            title={
              busqueda === null
                ? "Buscar en esta conversación"
                : "Cerrar la búsqueda"
            }
            aria-label={
              busqueda === null
                ? "Buscar en esta conversación"
                : "Cerrar la búsqueda"
            }
            aria-pressed={busqueda !== null}
            className="flex items-center gap-1.5 rounded-full border border-paper-line bg-paper px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent-strong"
          >
            <Search aria-hidden size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setConversationMuted(conversationId, next).catch(() =>
                setMuted(!next),
              );
            }}
            title={
              muted
                ? "Activar avisos de esta conversación"
                : "Silenciar esta conversación"
            }
            aria-pressed={muted}
            className="flex items-center gap-1.5 rounded-full border border-paper-line bg-paper px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent-strong"
          >
            {muted ? (
              <BellOff aria-hidden size={13} />
            ) : (
              <Bell aria-hidden size={13} />
            )}
            {muted ? "Silenciado" : "Avisos activos"}
          </button>
          {conversation.type === "DIRECT" && (
            <PresenceSelect current={self?.presenceStatus ?? null} />
          )}
        </div>
      </div>

      {busqueda !== null && (
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Search
              aria-hidden
              size={14}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
            />
            <Input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en esta conversación…"
              aria-label="Buscar en esta conversación"
              className="pl-8"
            />
          </div>
          {mostrandoResultados && (
            <p className="px-1 text-xs text-muted">
              {resultados.length === 0
                ? "Ningún mensaje con ese texto."
                : `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}, del más reciente al más antiguo.`}
            </p>
          )}
        </div>
      )}

      {/* `min-h-0` (y NO `min-h-[50vh]`): dentro de un contenedor flex, un
          hijo con altura mínima grande se niega a encoger, así que la lista
          desbordaba en vez de hacer scroll dentro de sí misma. */}
      <ul
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-paper-line bg-paper-raised p-4"
      >
        {buscando && (
          <li className="m-auto text-center text-sm text-muted">Buscando…</li>
        )}
        {!buscando && visibles.length === 0 && (
          <li className="m-auto text-center text-sm text-muted">
            {mostrandoResultados
              ? "Ningún mensaje con ese texto."
              : "Todavía no hay mensajes — escribe el primero."}
          </li>
        )}
        {!buscando &&
          visibles.map((message) => {
            const isSelf = message.userId === currentUserId;
            return (
              // `group`: el botón de borrar solo aparece al pasar por encima
              // (o al enfocarlo con teclado), para no llenar el hilo de
              // iconos — pero SIEMPRE es alcanzable tabulando.
              <li
                key={message.id}
                className={
                  isSelf
                    ? "group flex items-center justify-end gap-1"
                    : "group flex items-end gap-2"
                }
              >
                {isSelf && !message.pending && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(message.id)}
                    aria-label="Borrar este mensaje"
                    title="Borrar este mensaje"
                    // En móvil NO hay hover: dejarlo en `opacity-0` hasta
                    // pasar el ratón hacía imposible borrar desde el teléfono.
                    // Visible siempre en pantalla pequeña; en escritorio sí se
                    // esconde hasta el hover, donde sí existe.
                    className="shrink-0 rounded-full p-2 text-muted opacity-100 transition-opacity hover:text-danger focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:p-1.5 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 aria-hidden size={13} />
                  </button>
                )}
                {!isSelf && <Avatar email={message.email} size="sm" />}
                <div className="flex max-w-[75%] flex-col gap-0.5">
                  {!isSelf && conversation.type === "GROUP" && (
                    <span className="text-[11px] font-medium text-muted">
                      {shortEmailName(message.email)}
                    </span>
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
                  <span
                    className={`text-[10px] text-muted ${isSelf ? "text-right" : ""}`}
                  >
                    {formatEventTime(message.createdAt)}
                    {message.id === ultimoPropioId &&
                      (() => {
                        const visto = textoVisto(
                          conversation.participants,
                          currentUserId,
                          message.createdAt,
                          conversation.type === "GROUP",
                        );
                        return visto ? (
                          <>
                            {" · "}
                            <span className="text-accent">{visto}</span>
                          </>
                        ) : null;
                      })()}
                  </span>
                </div>
              </li>
            );
          })}
      </ul>

      {typingEmail && (
        <p className="-mt-1 text-xs text-muted italic">
          {shortEmailName(typingEmail)} está escribiendo…
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        className="flex flex-col gap-2"
      >
        {pendingImage && (
          <div className="flex items-center gap-2 rounded-lg border border-paper-line bg-paper p-2 text-xs text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob: URL), no cabe en next/image */}
            <img
              src={pendingImage.previewUrl}
              alt=""
              className="h-10 w-10 rounded object-cover"
            />
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
            Escribe un mensaje
          </label>
          {/* Sin BLOB_READ_WRITE_TOKEN el botón se enseña igual, pero
              desactivado y diciendo por qué. Antes desaparecía del todo, y
              eso se leía desde fuera como "las imágenes no funcionan" sin
              ninguna pista de que lo que falta es configurar el servidor
              (ver isBlobConfigured). Un control desactivado que explica su
              motivo enseña algo; uno ausente, no. */}
          {puedeAdjuntar ? (
            <>
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
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled
              aria-label="Adjuntar imagen (no disponible: falta configurar el almacenamiento de imágenes en el servidor)"
              title="Adjuntar imágenes no está configurado en este servidor (falta BLOB_READ_WRITE_TOKEN)."
            >
              <ImagePlus aria-hidden size={16} />
            </Button>
          )}
          <Input
            id="chat-input"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Escribe un mensaje…"
            disabled={sending}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={sending || (input.trim() === "" && !pendingImage)}
          >
            {sending ? (
              uploadingImage ? (
                "Subiendo…"
              ) : (
                "…"
              )
            ) : (
              <Send aria-hidden size={16} />
            )}
            <span className="sr-only sm:not-sr-only">Enviar</span>
          </Button>
        </div>
      </form>
    </section>
  );
}
