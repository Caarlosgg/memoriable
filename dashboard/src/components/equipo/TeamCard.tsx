import type { WorkspaceMemberInfo } from "@/app/(dashboard)/equipo/actions";
import { AddMemberForm } from "./AddMemberForm";
import { MemberRow } from "./MemberRow";

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
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-paper-line bg-paper-raised p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{nombre}</h2>
        <span className="text-xs text-muted">
          {members.length} {members.length === 1 ? "persona" : "personas"}
        </span>
      </div>
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
