"use client";

import { useState, type ReactNode } from "react";
import { Plus, Users, User, X } from "lucide-react";
import { createDirectConversation, createGroupConversation, type UserSearchResult } from "@/app/(dashboard)/chat/actions";
import { shortEmailName } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserSearchPicker } from "./UserSearchPicker";

type Mode = "individual" | "grupo";

/**
 * Crear conversación nueva — individual (1 a 1, reutiliza el hilo si ya
 * existía, ver createDirectConversation) o grupo (nombre + varias
 * personas). Con CUALQUIERA que tenga cuenta en MemorIAble, no solo
 * compañeros del equipo activo: el chat es del usuario, no del workspace
 * (ver el comentario de ChatConversation en el schema).
 */
export function NewConversationDialog({
  currentUserId,
  onCreated,
}: {
  currentUserId: string;
  onCreated: (conversationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("individual");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<UserSearchResult[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("individual");
    setGroupName("");
    setSelected([]);
    setError(null);
    setPending(false);
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
    const result = await createGroupConversation(groupName, selected.map((u) => u.userId));
    setPending(false);
    if (result.error || !result.conversationId) {
      setError(result.error || "No se ha podido crear el grupo.");
      return;
    }
    setOpen(false);
    reset();
    onCreated(result.conversationId);
  }

  const excludeIds = new Set([currentUserId, ...selected.map((u) => u.userId)]);

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

        {mode === "individual" ? (
          <UserSearchPicker
            excludeIds={new Set([currentUserId])}
            onPick={(u) => handleCreateDirect(u.userId)}
            placeholder="Busca a alguien por email…"
          />
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
            {selected.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {selected.map((u) => (
                  <li key={u.userId} className="flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-2.5 text-xs text-accent-strong">
                    {shortEmailName(u.email)}
                    <button
                      type="button"
                      onClick={() => setSelected((prev) => prev.filter((x) => x.userId !== u.userId))}
                      aria-label={`Quitar a ${u.email}`}
                      className="rounded-full p-0.5 hover:bg-accent/30"
                    >
                      <X aria-hidden size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <UserSearchPicker excludeIds={excludeIds} onPick={(u) => setSelected((prev) => [...prev, u])} placeholder="Añade personas por email…" />
            <Button type="button" onClick={handleCreateGroup} disabled={pending || groupName.trim() === "" || selected.length === 0}>
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
