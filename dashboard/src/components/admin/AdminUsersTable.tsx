"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, ShieldOff, MailCheck, Trash2 } from "lucide-react";
import {
  adminResetUserPassword,
  adminSetEmailVerified,
  adminSetSuperAdmin,
  adminDeleteUser,
  type AdminUserRow,
} from "@/app/(dashboard)/admin/actions";
import { formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Fila individual, con su propia confirmación "escribe el email" para eliminar — demasiado destructivo para un simple confirm(). */
function AdminUserRowItem({ user }: { user: AdminUserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  function runAction(action: () => Promise<{ error?: string }>, successMessage: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.error ?? successMessage);
      if (!result.error) router.refresh();
    });
  }

  function handleDelete() {
    if (deleteInput.trim().toLowerCase() !== user.email.toLowerCase()) return;
    runAction(() => adminDeleteUser(user.id), "Cuenta eliminada.");
    setConfirmingDelete(false);
    setDeleteInput("");
  }

  return (
    <tr className="border-b border-paper-line align-top">
      <td className="py-3 pr-3">
        <p className="text-sm font-medium text-ink">
          {user.email}
          {user.isSelf && <span className="text-muted"> (tú)</span>}
        </p>
        <p className="text-xs text-muted">Alta: {formatDate(user.createdAt)}</p>
        <p className="mt-1 flex flex-wrap gap-1">
          {!user.emailVerified && (
            <span className="rounded-full bg-highlight-soft px-2 py-0.5 text-[10px] font-semibold text-highlight-strong">
              Email sin verificar
            </span>
          )}
          {user.accountPending && (
            <span className="rounded-full bg-highlight-soft px-2 py-0.5 text-[10px] font-semibold text-highlight-strong">
              Cuenta por activar
            </span>
          )}
          {user.isSuperAdmin && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-strong">
              Superadmin
            </span>
          )}
          {!user.hasPassword && (
            <span className="rounded-full bg-paper-line/60 px-2 py-0.5 text-[10px] font-medium text-muted">
              Solo Google
            </span>
          )}
        </p>
      </td>
      <td className="py-3 pr-3 text-center text-sm text-muted">{user.membershipCount}</td>
      <td className="py-3">
        {!confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => runAction(() => adminResetUserPassword(user.id), "Correo de restablecimiento enviado.")}
            >
              <KeyRound aria-hidden size={13} /> Restablecer contraseña
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() =>
                runAction(
                  () => adminSetEmailVerified(user.id, !user.emailVerified),
                  user.emailVerified ? "Email marcado como no verificado." : "Email verificado.",
                )
              }
            >
              <MailCheck aria-hidden size={13} /> {user.emailVerified ? "Desverificar email" : "Verificar email"}
            </Button>
            {!user.isSelf && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  runAction(
                    () => adminSetSuperAdmin(user.id, !user.isSuperAdmin),
                    user.isSuperAdmin ? "Ya no es superadmin." : "Ahora es superadmin.",
                  )
                }
              >
                {user.isSuperAdmin ? <ShieldOff aria-hidden size={13} /> : <ShieldCheck aria-hidden size={13} />}
                {user.isSuperAdmin ? "Quitar superadmin" : "Hacer superadmin"}
              </Button>
            )}
            {!user.isSelf && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 aria-hidden size={13} /> Eliminar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-lg border border-danger/30 bg-danger-soft p-2.5">
            <p className="text-xs text-danger">
              Escribe <span className="font-semibold">{user.email}</span> para confirmar. Esto borra su cuenta y
              todo su espacio personal (notas, eventos, ahorros, historial del Asistente) — no se puede deshacer.
            </p>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={user.email}
              className="h-8 text-xs"
            />
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending || deleteInput.trim().toLowerCase() !== user.email.toLowerCase()}
                onClick={handleDelete}
              >
                Confirmar eliminación
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteInput("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {message && <p className="mt-1.5 text-xs text-muted">{message}</p>}
      </td>
    </tr>
  );
}

export function AdminUsersTable({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? initialUsers.filter((u) => u.email.toLowerCase().includes(query.trim().toLowerCase()))
    : initialUsers;

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por email…"
        aria-label="Buscar usuarios por email"
        className="max-w-xs"
      />
      <div className="overflow-x-auto rounded-2xl border border-paper-line bg-paper-raised p-4">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-paper-line text-xs font-semibold text-muted">
              <th className="pb-2 pr-3 font-semibold">Cuenta</th>
              <th className="pb-2 pr-3 text-center font-semibold">Espacios</th>
              <th className="pb-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <AdminUserRowItem key={user.id} user={user} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted">Sin resultados.</p>}
      </div>
    </div>
  );
}
