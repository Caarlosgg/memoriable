import { History, StickyNote, CircleCheck, UserRound, UserPlus, ShieldCheck } from "lucide-react";
import { listActivity } from "@/lib/activityLog";
import { formatDate } from "@/lib/format";

const TIPO_LABEL: Record<string, { texto: string; Icon: typeof History }> = {
  nota_creada: { texto: "creó una nota/tarea", Icon: StickyNote },
  tarea_completada: { texto: "completó una tarea", Icon: CircleCheck },
  tarea_asignada: { texto: "asignó una tarea", Icon: UserRound },
  miembro_invitado: { texto: "invitó a alguien al equipo", Icon: UserPlus },
  miembro_añadido: { texto: "añadió a alguien al equipo", Icon: UserPlus },
  rol_cambiado: { texto: "cambió el rol de alguien", Icon: ShieldCheck },
};

function activityLabel(tipo: string): string {
  return TIPO_LABEL[tipo]?.texto ?? tipo.replace(/_/g, " ");
}

/**
 * Feed cronológico de "qué ha pasado en el equipo" (ver ActivityLog en
 * schema.prisma) — sin analítica, solo un registro legible, pensado para
 * un negocio pequeño que quiere saber qué ha pasado sin depender de
 * recordar quién hizo qué.
 */
export async function ActivityFeed({ workspaceId }: { workspaceId: string }) {
  const items = await listActivity(workspaceId);
  if (items.length === 0) return null;

  return (
    <details className="rounded-xl border border-paper-line bg-paper-raised/60 p-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted select-none">
        <History aria-hidden size={13} /> Actividad reciente
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5 border-t border-paper-line pt-2">
        {items.map((item) => {
          const { Icon } = TIPO_LABEL[item.tipo] ?? { Icon: History };
          return (
            <li key={item.id} className="flex items-center gap-1.5 text-[11px] text-muted">
              <Icon aria-hidden size={11} className="shrink-0 text-accent" />
              <span className="truncate">
                <span className="font-medium text-ink">{item.userEmail.split("@")[0]}</span> {activityLabel(item.tipo)}
              </span>
              <span className="ml-auto shrink-0">{formatDate(item.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
