"use client";

import { Users, BellOff, Search } from "lucide-react";
import type { ConversationView } from "@/app/(dashboard)/chat/actions";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { isOnline } from "@/lib/presence";
import { NewConversationDialog } from "./NewConversationDialog";

function ConversationAvatar({ conversation }: { conversation: ConversationView }) {
  if (conversation.type === "GROUP") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
        <Users aria-hidden size={16} />
      </span>
    );
  }
  const other = conversation.participants.find((p) => p.userId === conversation.otherUserId);
  return (
    <span className="relative shrink-0">
      <Avatar email={other?.email ?? conversation.nombre} size="md" />
      {other && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper ${
            isOnline(other.lastSeenAt) ? "bg-accent" : "bg-paper-line"
          }`}
        />
      )}
    </span>
  );
}

/** Vista previa corta del último mensaje (o del adjunto, si es solo imagen). */
function previewOf(lastMessage: ConversationView["lastMessage"]): string {
  if (!lastMessage) return "Sin mensajes todavía.";
  if (lastMessage.texto) return lastMessage.texto;
  if (lastMessage.imagenUrl) return "📷 Imagen";
  return "";
}

/**
 * Panel izquierdo tipo WhatsApp: lista de conversaciones (individuales y
 * grupos) del workspace activo, ordenadas por actividad reciente, con
 * previsualización del último mensaje y aviso de no leído. `+` abre
 * `NewConversationDialog` para empezar una individual o crear un grupo.
 */
export function ConversationList({
  conversations,
  activeId,
  currentUserId,
  onSelect,
  onCreated,
  filtro,
  onFiltroChange,
}: {
  /** Texto para filtrar la lista por nombre — el estado vive en ChatShell para no perderlo al recargar la lista. */
  filtro: string;
  onFiltroChange: (valor: string) => void;
  conversations: ConversationView[];
  activeId: string | null;
  currentUserId: string;
  onSelect: (conversationId: string) => void;
  onCreated: (conversationId: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-ink">Conversaciones</h2>
        <NewConversationDialog currentUserId={currentUserId} onCreated={onCreated} />
      </div>

      {/* Filtro por nombre: con unos cuantos grupos y personas, buscar a
          ojo por la lista es lo primero que se vuelve lento. Solo aparece
          cuando ya hay bastantes como para que haga falta. */}
      {conversations.length > 5 && (
        <div className="relative">
          <Search aria-hidden size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => onFiltroChange(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar una conversación por nombre"
            className="w-full rounded-lg border border-paper-line bg-paper py-1.5 pr-2 pl-8 text-sm text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>
      )}

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {conversations.length === 0 && (
          <li className="p-3 text-center text-sm text-muted">
            {filtro ? "Ninguna conversación coincide." : "Todavía no hay conversaciones."}
          </li>
        )}
        {conversations.map((c) => {
          const isActive = c.id === activeId;
          const isImageOnly = !c.lastMessage?.texto && !!c.lastMessage?.imagenUrl;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-current={isActive ? "true" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors ${
                  isActive ? "bg-accent-soft" : "hover:bg-paper"
                }`}
              >
                <ConversationAvatar conversation={c} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{shortEmailName(c.nombre)}</span>
                    {c.lastMessage && (
                      <span className="shrink-0 text-[10px] text-muted">{formatEventTime(c.lastMessage.createdAt)}</span>
                    )}
                  </div>
                  {/* De qué equipo es el grupo automático: con varios
                      equipos, todos se llaman "Equipo" y sin esto no había
                      forma de saber en cuál ibas a escribir. */}
                  {c.equipo && (
                    <span className="w-fit truncate rounded-full bg-accent-soft px-1.5 text-[10px] font-medium text-accent-strong">
                      {c.equipo}
                    </span>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted">
                    {c.muted && <BellOff aria-hidden size={11} className="shrink-0" />}
                    <span className={`truncate ${isImageOnly ? "italic" : ""}`}>{previewOf(c.lastMessage)}</span>
                  </div>
                </div>
                {c.unreadCount > 0 && (
                  // Un número, no un punto: saber si son 2 o 40 cambia si lo
                  // abres ahora o luego. A partir de 99 se recorta, como en
                  // cualquier app de mensajería.
                  <span
                    aria-label={`${c.unreadCount} sin leer`}
                    className="min-w-5 shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold text-accent-ink"
                  >
                    {c.unreadCount > 99 ? "99+" : c.unreadCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
