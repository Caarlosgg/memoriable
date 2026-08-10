import { Avatar } from "@/components/ui/avatar";
import type { WorkspaceMemberInfo } from "@/app/(dashboard)/equipo/actions";
import { AddMemberForm } from "./AddMemberForm";

const ROLE_LABELS: Record<string, string> = { OWNER: "Propietario", ADMIN: "Admin", MEMBER: "Miembro" };

/** Ficha de un equipo en /equipo: lista de miembros + formulario para añadir (solo si eres owner/admin). */
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
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-paper-line bg-paper-raised p-5">
      <h2 className="font-display text-lg font-semibold text-ink">{nombre}</h2>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
            <Avatar email={m.email} />
            <span className="flex-1 truncate text-sm text-ink">
              {m.email}
              {m.isSelf && <span className="text-muted"> (tú)</span>}
            </span>
            <span className="text-xs text-muted">{ROLE_LABELS[m.role] ?? m.role}</span>
            {m.status === "PENDING" && (
              <span className="rounded-full bg-highlight-soft px-2 py-0.5 text-[10px] font-semibold text-highlight-strong">
                Pendiente
              </span>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="border-t border-paper-line pt-4">
          <AddMemberForm workspaceId={workspaceId} />
        </div>
      )}
    </section>
  );
}
