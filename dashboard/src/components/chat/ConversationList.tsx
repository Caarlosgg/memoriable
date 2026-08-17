"use client";

import { Users, BellOff } from "lucide-react";
import type { ConversationView } from "@/app/(dashboard)/chat/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { isOnline } from "@/lib/presence";
import { NewConversationDialog } from "./NewConversationDialog";

function ConversationAvatar({ conversation, members }: { conversation: ConversationView; members: WorkspaceMemberInfo[] }) {
  if (conversation.type === "GROUP") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
        <Users aria-hidden size={16} />
      </span>
    );
  }
  const other = members.find((m) => m.userId === conversation.otherUserId);
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
  members,
  currentUserId,
  onSelect,
  onCreated,
}: {
  conversations: ConversationView[];
  activeId: string | null;
  members: WorkspaceMemberInfo[];
  currentUserId: string;
  onSelect: (conversationId: string) => void;
  onCreated: (conversationId: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-ink">Conversaciones</h2>
        <NewConversationDialog members={members} currentUserId={currentUserId} onCreated={onCreated} />
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {conversations.length === 0 && <li className="p-3 text-center text-sm text-muted">Todavía no hay conversaciones.</li>}
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
                <ConversationAvatar conversation={c} members={members} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{shortEmailName(c.nombre)}</span>
                    {c.lastMessage && (
                      <span className="shrink-0 text-[10px] text-muted">{formatEventTime(c.lastMessage.createdAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    {c.muted && <BellOff aria-hidden size={11} className="shrink-0" />}
                    <span className={`truncate ${isImageOnly ? "italic" : ""}`}>{previewOf(c.lastMessage)}</span>
                  </div>
                </div>
                {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="No leído" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
