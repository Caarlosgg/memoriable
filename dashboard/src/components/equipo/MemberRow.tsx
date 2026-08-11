"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { changeRole, removeMember, leaveWorkspace, type WorkspaceMemberInfo } from "@/app/(dashboard)/equipo/actions";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  MEMBER: "Miembro",
  VIEWER: "Solo lectura",
};

/**
 * Fila de un miembro en /equipo: rol y acciones (cambiar rol, quitar) solo
 * si `canManage` (eres owner/admin) Y no es una fila que no se puede tocar
 * (a ti mismo, o al propietario — ver equipo/actions.ts para el porqué de
 * ambos límites).
 */
export function MemberRow({
  workspaceId,
  member,
  canManage,
}: {
  workspaceId: string;
  member: WorkspaceMemberInfo;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canEditThis = canManage && !member.isSelf && member.role !== "OWNER";

  function handleRoleChange(role: string) {
    setError(null);
    startTransition(async () => {
      const result = await changeRole(workspaceId, member.userId, role as "MEMBER" | "ADMIN" | "VIEWER");
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRemove() {
    if (!confirm(`¿Quitar a ${member.email} del equipo?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMember(workspaceId, member.userId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleLeave() {
    if (!confirm("¿Salir de este equipo? Dejarás de ver sus notas, tablero y calendario.")) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveWorkspace(workspaceId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
        <Avatar email={member.email} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {member.email}
          {member.isSelf && <span className="text-muted"> (tú)</span>}
        </span>

        {member.status === "PENDING" && (
          <span className="shrink-0 rounded-full bg-highlight-soft px-2 py-0.5 text-[10px] font-semibold text-highlight-strong">
            Invitación pendiente
          </span>
        )}
        {member.status === "ACTIVE" && member.accountPending && (
          <span className="shrink-0 rounded-full bg-highlight-soft px-2 py-0.5 text-[10px] font-semibold text-highlight-strong">
            Cuenta por activar
          </span>
        )}

        {canEditThis ? (
          <select
            value={member.role}
            onChange={(e) => handleRoleChange(e.target.value)}
            disabled={pending}
            aria-label={`Cambiar el rol de ${member.email}`}
            className="shrink-0 rounded-lg border border-paper-line bg-paper px-2 py-1 text-xs text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <option value="MEMBER">Miembro</option>
            <option value="ADMIN">Administrador</option>
            <option value="VIEWER">Solo lectura</option>
          </select>
        ) : (
          <span className="shrink-0 text-xs text-muted">{ROLE_LABELS[member.role] ?? member.role}</span>
        )}

        {canEditThis && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            aria-label={`Quitar a ${member.email} del equipo`}
            className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <Trash2 aria-hidden size={14} />
          </button>
        )}

        {member.isSelf && (
          <button
            type="button"
            onClick={handleLeave}
            disabled={pending}
            aria-label="Salir de este equipo"
            title="Salir del equipo"
            className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <LogOut aria-hidden size={14} />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="pl-11 text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
