"use client";

import { useState, type ReactNode } from "react";
import { Plus, Users, User } from "lucide-react";
import { createDirectConversation, createGroupConversation } from "@/app/(dashboard)/chat/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Mode = "individual" | "grupo";

/**
 * Crear conversación nueva — individual (1 a 1, reutiliza el hilo si ya
 * existía, ver createDirectConversation) o grupo (nombre + varios
 * miembros). Un único diálogo con dos modos en vez de dos botones/rutas
 * distintas: la elección de con quién hablar es lo único que cambia.
 */
export function NewConversationDialog({
  members,
  currentUserId,
  onCreated,
}: {
  members: WorkspaceMemberInfo[];
  currentUserId: string;
  onCreated: (conversationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("individual");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = members.filter((m) => m.userId !== currentUserId && m.status === "ACTIVE");

  function reset() {
    setMode("individual");
    setGroupName("");
    setSelectedIds(new Set());
    setError(null);
    setPending(false);
  }

  function toggleSelected(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleCreateDirect(userId: string) {
    setPending(true);
    setError(null);
    const result = await createDirectConversation(userId);
    setPending(false);
    if (result.error || !result.conversationId) {
      setError(result.error || "No se ha podido crear la conversación.");
      return;
    }
    setOpen(false);
    reset();
    onCreated(result.conversationId);
  }

  async function handleCreateGroup() {
    setPending(true);
    setError(null);
    const result = await createGroupConversation(groupName, [...selectedIds]);
    setPending(false);
    if (result.error || !result.conversationId) {
      setError(result.error || "No se ha podido crear el grupo.");
      return;
    }
    setOpen(false);
    reset();
    onCreated(result.conversationId);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="icon" aria-label="Nueva conversación">
          <Plus aria-hidden size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva conversación</DialogTitle>
        </DialogHeader>

        <div className="mb-4 flex gap-2">
          <ModeButton active={mode === "individual"} onClick={() => setMode("individual")} icon={<User aria-hidden size={14} />}>
            Individual
          </ModeButton>
          <ModeButton active={mode === "grupo"} onClick={() => setMode("grupo")} icon={<Users aria-hidden size={14} />}>
            Grupo
          </ModeButton>
        </div>

        {others.length === 0 ? (
          <p className="text-sm text-muted">No hay más miembros activos en este equipo todavía.</p>
        ) : mode === "individual" ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {others.map((m) => (
              <li key={m.userId}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleCreateDirect(m.userId)}
                  className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm text-ink transition-colors hover:bg-accent-soft disabled:opacity-50"
                >
                  <Avatar email={m.email} size="sm" />
                  <span className="truncate">{shortEmailName(m.email)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-3">
            <label htmlFor="group-name" className="sr-only">
              Nombre del grupo
            </label>
            <Input
              id="group-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Nombre del grupo…"
              maxLength={40}
            />
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {others.map((m) => {
                const checked = selectedIds.has(m.userId);
                return (
                  <li key={m.userId}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-sm text-ink transition-colors hover:bg-accent-soft">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(m.userId)}
                        className="h-4 w-4 shrink-0 rounded border-paper-line accent-accent"
                      />
                      <Avatar email={m.email} size="sm" />
                      <span className="truncate">{shortEmailName(m.email)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              onClick={handleCreateGroup}
              disabled={pending || groupName.trim() === "" || selectedIds.size === 0}
            >
              {pending ? "Creando…" : "Crear grupo"}
            </Button>
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

function ModeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-paper-line bg-paper text-muted hover:border-accent hover:text-accent-strong"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
