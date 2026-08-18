"use client";

import { useState, type ReactNode } from "react";
import { UserPlus, LogOut, X } from "lucide-react";
import { addParticipants, leaveConversation, type ConversationView, type UserSearchResult } from "@/app/(dashboard)/chat/actions";
import { shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserSearchPicker } from "./UserSearchPicker";

/**
 * Ficha de la conversación: quién está dentro y, si es un grupo, añadir a
 * más gente (cualquiera con cuenta en MemorIAble, no solo del equipo — ver
 * UserSearchPicker) o salirse.
 *
 * `conversation.participants` ya trae email/presencia de cada uno (ver
 * listConversations en chat/actions.ts) — no hace falta volver a pedirlos
 * ni depender de la lista de miembros de ningún workspace.
 */
export function ConversationInfoDialog({
  conversation,
  currentUserId,
  onChanged,
  onLeft,
  children,
}: {
  conversation: ConversationView;
  currentUserId: string;
  onChanged: () => void;
  /** Salir de un grupo lo saca de la lista — quien llama decide a dónde ir después. */
  onLeft: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [toAdd, setToAdd] = useState<UserSearchResult[]>([]);
  const [pending, setPending] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esGrupo = conversation.type === "GROUP";

  async function handleAdd() {
    setPending(true);
    setError(null);
    const result = await addParticipants(conversation.id, toAdd.map((u) => u.userId));
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setToAdd([]);
    setOpen(false);
    onChanged();
  }

  async function handleLeave() {
    setPending(true);
    setError(null);
    const result = await leaveConversation(conversation.id);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    onLeft();
  }

  const excludeIds = new Set([...conversation.participants.map((p) => p.userId), ...toAdd.map((u) => u.userId)]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setToAdd([]);
          setConfirmingLeave(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esGrupo ? conversation.nombre : shortEmailName(conversation.nombre)}</DialogTitle>
        </DialogHeader>

        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
          {esGrupo
            ? `${conversation.participants.length} ${conversation.participants.length === 1 ? "persona" : "personas"}`
            : "Conversación individual"}
        </p>
        <ul className="mb-4 flex flex-col gap-1">
          {conversation.participants.map((p) => (
            <li key={p.userId} className="flex items-center gap-2.5 p-1.5 text-sm text-ink">
              <Avatar email={p.email} size="sm" />
              <span className="truncate">{shortEmailName(p.email)}</span>
              {p.userId === currentUserId && <span className="text-xs text-muted">(tú)</span>}
            </li>
          ))}
        </ul>

        {esGrupo && (
          <div className="mb-4 flex flex-col gap-2 border-t border-paper-line pt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <UserPlus aria-hidden size={14} className="text-muted" /> Añadir al grupo
            </p>
            {toAdd.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {toAdd.map((u) => (
                  <li key={u.userId} className="flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-2.5 text-xs text-accent-strong">
                    {shortEmailName(u.email)}
                    <button
                      type="button"
                      onClick={() => setToAdd((prev) => prev.filter((x) => x.userId !== u.userId))}
                      aria-label={`Quitar a ${u.email}`}
                      className="rounded-full p-0.5 hover:bg-accent/30"
                    >
                      <X aria-hidden size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <UserSearchPicker excludeIds={excludeIds} onPick={(u) => setToAdd((prev) => [...prev, u])} />
            <Button type="button" size="sm" onClick={handleAdd} disabled={pending || toAdd.length === 0} className="w-fit">
              {pending ? "Añadiendo…" : "Añadir"}
            </Button>
          </div>
        )}

        {esGrupo && (
          <div className="border-t border-paper-line pt-4">
            {confirmingLeave ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="destructive" size="sm" onClick={handleLeave} disabled={pending}>
                  {pending ? "Saliendo…" : "Sí, salir del grupo"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingLeave(false)} disabled={pending}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingLeave(true)} className="text-danger hover:bg-danger-soft">
                <LogOut aria-hidden size={14} /> Salir del grupo
              </Button>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
