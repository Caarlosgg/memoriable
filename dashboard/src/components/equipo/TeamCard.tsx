"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { renameWorkspace } from "@/app/(dashboard)/equipo/actions";
import { AddMemberForm } from "./AddMemberForm";
import { MemberRow } from "./MemberRow";
import { Input } from "@/components/ui/input";

/** Ficha de un equipo en /equipo: plantilla (lista de miembros con rol y acciones) + alta de nuevos miembros (solo owner/admin). */
export function TeamCard({
  workspaceId,
  nombre,
  members,
  canManage,
}: {
  workspaceId: string;
  nombre: string;
  members: WorkspaceMemberInfo[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(nombre);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSaveName() {
    setNameError(null);
    startTransition(async () => {
      const result = await renameWorkspace(workspaceId, nameInput);
      if (result.error) {
        setNameError(result.error);
        return;
      }
      setEditingName(false);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-paper-line bg-paper-raised p-5">
      <div className="flex items-center justify-between gap-2">
        {editingName ? (
          <div className="flex flex-1 items-center gap-1.5">
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={60}
              autoFocus
              aria-label="Nombre del equipo"
              className="h-9 flex-1"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={pending}
              aria-label="Guardar nombre"
              className="shrink-0 rounded-full p-1.5 text-accent transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <Check aria-hidden size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setNameInput(nombre);
                setNameError(null);
              }}
              disabled={pending}
              aria-label="Cancelar"
              className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <X aria-hidden size={16} />
            </button>
          </div>
        ) : (
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
            {nombre}
            {canManage && (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                aria-label={`Renombrar el equipo ${nombre}`}
                className="rounded-full p-1 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <Pencil aria-hidden size={13} />
              </button>
            )}
          </h2>
        )}
        <span className="shrink-0 text-xs text-muted">
          {members.length} {members.length === 1 ? "persona" : "personas"}
        </span>
      </div>
      {nameError && (
        <p role="alert" className="-mt-2 text-xs text-danger">
          {nameError}
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {members.map((m) => (
          <MemberRow key={m.userId} workspaceId={workspaceId} member={m} canManage={canManage} />
        ))}
      </ul>
      {canManage && (
        <div className="border-t border-paper-line pt-4">
          <p className="mb-2 text-sm font-medium text-ink">Añadir a la plantilla</p>
          <AddMemberForm workspaceId={workspaceId} />
        </div>
      )}
    </section>
  );
}
