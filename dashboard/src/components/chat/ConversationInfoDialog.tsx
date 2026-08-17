"use client";

import { useState, type ReactNode } from "react";
import { UserPlus, LogOut } from "lucide-react";
import { addParticipants, leaveConversation, type ConversationView } from "@/app/(dashboard)/chat/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Ficha de la conversación: quién está dentro y, si es un grupo, añadir a
 * más gente o salirse. Sin esto, `addParticipants`/`leaveConversation`
 * existían en el servidor pero no había forma de llamarlas desde la app.
 *
 * `participantIds` llega desde el hilo (no se consulta aquí): la lista de
 * participantes ya viaja con la conversación, y volver a pedirla solo para
 * abrir esta ficha sería una consulta de más por cada clic.
 */
export function ConversationInfoDialog({
  conversation,
  participantIds,
  members,
  currentUserId,
  onChanged,
  onLeft,
  children,
}: {
  conversation: ConversationView;
  participantIds: string[];
  members: WorkspaceMemberInfo[];
  currentUserId: string;
  onChanged: () => void;
  /** Salir de un grupo lo saca de la lista — quien llama decide a dónde ir después. */
  onLeft: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dentro = members.filter((m) => participantIds.includes(m.userId));
  const fuera = members.filter((m) => !participantIds.includes(m.userId) && m.status === "ACTIVE");
  const esGrupo = conversation.type === "GROUP";

  function toggle(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleAdd() {
    setPending(true);
    setError(null);
    const result = await addParticipants(conversation.id, [...selectedIds]);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSelectedIds(new Set());
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelectedIds(new Set());
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
          {esGrupo ? `${dentro.length} ${dentro.length === 1 ? "persona" : "personas"}` : "Conversación individual"}
        </p>
        <ul className="mb-4 flex flex-col gap-1">
          {dentro.map((m) => (
            <li key={m.userId} className="flex items-center gap-2.5 p-1.5 text-sm text-ink">
              <Avatar email={m.email} size="sm" />
              <span className="truncate">{shortEmailName(m.email)}</span>
              {m.userId === currentUserId && <span className="text-xs text-muted">(tú)</span>}
            </li>
          ))}
        </ul>

        {esGrupo && fuera.length > 0 && (
          <div className="mb-4 flex flex-col gap-2 border-t border-paper-line pt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <UserPlus aria-hidden size={14} className="text-muted" /> Añadir al grupo
            </p>
            <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
              {fuera.map((m) => (
                <li key={m.userId}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-sm text-ink transition-colors hover:bg-accent-soft">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.userId)}
                      onChange={() => toggle(m.userId)}
                      className="h-4 w-4 shrink-0 rounded border-paper-line accent-accent"
                    />
                    <Avatar email={m.email} size="sm" />
                    <span className="truncate">{shortEmailName(m.email)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" onClick={handleAdd} disabled={pending || selectedIds.size === 0} className="w-fit">
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
