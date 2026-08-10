"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { adminDeleteWorkspace, type AdminWorkspaceRow } from "@/app/(dashboard)/admin/actions";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

function AdminWorkspaceRowItem({ workspace }: { workspace: AdminWorkspaceRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`¿Eliminar el equipo "${workspace.nombre}"? Esto no se puede deshacer.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminDeleteWorkspace(workspace.id);
      setMessage(result.error ?? null);
      if (!result.error) router.refresh();
    });
  }

  return (
    <tr className="border-b border-paper-line align-top">
      <td className="py-3 pr-3">
        <p className="text-sm font-medium text-ink">{workspace.nombre}</p>
        <p className="text-xs text-muted">
          {workspace.personal ? "Personal" : "Equipo"} · Alta: {formatDate(workspace.createdAt)}
        </p>
      </td>
      <td className="py-3 pr-3 text-center text-sm text-muted">{workspace.memberCount}</td>
      <td className="py-3 pr-3 text-center text-sm text-muted">{workspace.messageCount}</td>
      <td className="py-3 pr-3 text-center text-sm text-muted">{workspace.eventoCount}</td>
      <td className="py-3">
        {!workspace.personal && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleDelete}>
              <Trash2 aria-hidden size={13} /> Eliminar
            </Button>
            {message && <p className="mt-1.5 text-xs text-danger">{message}</p>}
          </>
        )}
      </td>
    </tr>
  );
}

export function AdminWorkspacesTable({ workspaces }: { workspaces: AdminWorkspaceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-paper-line bg-paper-raised p-4">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-paper-line text-xs font-semibold text-muted">
            <th className="pb-2 pr-3 font-semibold">Espacio</th>
            <th className="pb-2 pr-3 text-center font-semibold">Miembros</th>
            <th className="pb-2 pr-3 text-center font-semibold">Notas</th>
            <th className="pb-2 pr-3 text-center font-semibold">Eventos</th>
            <th className="pb-2 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((w) => (
            <AdminWorkspaceRowItem key={w.id} workspace={w} />
          ))}
        </tbody>
      </table>
      {workspaces.length === 0 && <p className="py-6 text-center text-sm text-muted">Sin resultados.</p>}
    </div>
  );
}
