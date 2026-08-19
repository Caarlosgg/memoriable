"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listChatMessages,
  listConversations,
  markConversationRead,
  type ChatMessageView,
  type ConversationView,
} from "@/app/(dashboard)/chat/actions";
import { MessageCircle } from "lucide-react";
import { useVisibilityAwarePolling } from "@/lib/useVisibilityAwarePolling";
import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";

/**
 * Cada cuánto se refresca la LISTA (no el hilo abierto, que tiene su
 * propio Realtime + sondeo en ConversationThread). Sin esto, la lista solo
 * se rehacía al crear o abandonar una conversación: un mensaje que llegaba
 * a OTRA conversación no movía su contador de no leídos ni su vista
 * previa hasta recargar la página entera, que es justo lo que hacía que el
 * chat pareciera "congelado" desde fuera.
 *
 * 8s (y no los 2s del hilo abierto) porque aquí basta con enterarse, no
 * con seguir una conversación en vivo — y son N conversaciones por
 * consulta, no una. El sondeo se para solo con la pestaña de fondo y
 * refresca al instante al volver (ver useVisibilityAwarePolling).
 */
const POLL_LISTA_MS = 8000;

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
  currentUserId,
  puedeAdjuntar,
}: {
  initialConversations: ConversationView[];
  initialSelectedId: string | null;
  initialMessages: ChatMessageView[];
  currentUserId: string;
  /** Ver isBlobConfigured — se resuelve en el servidor y baja como prop. */
  puedeAdjuntar: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [messages, setMessages] = useState(initialMessages);
  const [loading, setLoading] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">(
    initialSelectedId ? "thread" : "list",
  );
  const [filtro, setFiltro] = useState("");

  async function selectConversation(id: string) {
    setSelectedId(id);
    setMobileView("thread");
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    );
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

  // La conversación abierta se está leyendo AHORA mismo. `markConversationRead`
  // va por su cuenta (sin await, ver selectConversation), así que un sondeo
  // que caiga entre medias puede traerla todavía con no leídos y volver a
  // pintar el contador de algo que el usuario tiene delante. Se lee de un
  // ref y no del estado para que el sondeo no dependa de re-crearse en cada
  // cambio de conversación (mismo patrón que `byEstadoRef` en KanbanBoard).
  // La escritura va en un efecto, no en el cuerpo del render: tocar un ref
  // durante el render está prohibido por las reglas de React de este
  // proyecto (ver el mismo comentario en useVisibilityAwarePolling).
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refreshConversations = useCallback(async (): Promise<void> => {
    try {
      const fresh = await listConversations();
      setConversations(
        fresh.map((c) =>
          c.id === selectedIdRef.current ? { ...c, unreadCount: 0 } : c,
        ),
      );
    } catch (err) {
      console.error("No se pudo actualizar la lista de conversaciones:", err);
    }
  }, []);

  // Mantiene vivos los no leídos, la vista previa del último mensaje y las
  // conversaciones nuevas que abra otra persona, sin recargar la página.
  useVisibilityAwarePolling(refreshConversations, POLL_LISTA_MS);

  async function handleCreated(id: string) {
    await refreshConversations();
    await selectConversation(id);
  }

  /** Tras salir de un grupo ya no se pertenece a él: se deselecciona y se vuelve a la lista. */
  async function handleLeft() {
    setSelectedId(null);
    setMessages([]);
    setMobileView("list");
    await refreshConversations();
  }

  const selectedConversation =
    conversations.find((c) => c.id === selectedId) ?? null;
  // El filtro solo afecta a la LISTA, nunca al hilo abierto: escribir en el
  // buscador no debe cerrarte la conversación que estás leyendo.
  const filtroNormalizado = filtro.trim().toLowerCase();
  const conversationsVisibles = filtroNormalizado
    ? conversations.filter((c) =>
        c.nombre.toLowerCase().includes(filtroNormalizado),
      )
    : conversations;

  return (
    // Altura acotada TAMBIÉN en móvil (antes solo en `md:`): sin tope, la
    // lista de mensajes crecía con el contenido y estiraba la página
    // entera, así que había que bajar mucho para llegar al campo de
    // escribir. `dvh` en vez de `vh` porque en móvil la barra del
    // navegador aparece y desaparece — con `vh` el campo de escribir
    // quedaba tapado justo cuando se abre el teclado.
    <div className="flex min-h-0 flex-1 flex-col gap-4 h-[calc(100dvh-16rem)] md:h-[calc(100dvh-11rem)] md:flex-row">
      <div
        className={`min-h-0 flex-col rounded-2xl border border-paper-line bg-paper-raised/60 p-3 md:flex md:w-72 md:shrink-0 ${mobileView === "list" ? "flex" : "hidden"}`}
      >
        <ConversationList
          conversations={conversationsVisibles}
          activeId={selectedId}
          currentUserId={currentUserId}
          onSelect={selectConversation}
          onCreated={handleCreated}
          filtro={filtro}
          onFiltroChange={setFiltro}
        />
      </div>
      <div
        className={`min-h-0 min-w-0 flex-1 md:flex ${mobileView === "thread" ? "flex" : "hidden"}`}
      >
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
            onBack={() => setMobileView("list")}
            onConversationChanged={refreshConversations}
            onLeft={handleLeft}
            puedeAdjuntar={puedeAdjuntar}
          />
        )}
      </div>
    </div>
  );
}
