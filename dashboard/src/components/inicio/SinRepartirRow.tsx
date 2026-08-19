"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AssigneeControl } from "@/components/AssigneeControl";
import { assignMessage } from "@/app/(dashboard)/actions";
import { presentCategory } from "@/lib/categories";
import type { WorkspaceMemberInfo } from "@/lib/workspace";

/**
 * Fila de "sin repartir" que se puede resolver ahí mismo: elegir a alguien
 * la asigna sin salir de Inicio. Es la diferencia real entre un informe
 * ("hay 4 sin asignar") y una acción ("ya no hay 4 sin asignar").
 */
export function SinRepartirRow({
  id,
  resumen,
  categoria,
  members,
}: {
  id: string;
  resumen: string;
  categoria: string;
  members: WorkspaceMemberInfo[];
}) {
  const { Icon, color } = presentCategory(categoria);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [oculta, setOculta] = useState(false);

  function handleChange(assigneeId: string | null) {
    if (!assigneeId) return;
    setOculta(true);
    startTransition(async () => {
      const result = await assignMessage(id, assigneeId);
      if (result.error) setOculta(false);
      else router.refresh();
    });
  }

  if (oculta) return null;

  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <Icon aria-hidden size={14} className={`shrink-0 ${color}`} />
      <span className="min-w-0 flex-1 truncate text-ink">{resumen}</span>
      <AssigneeControl assigneeId={null} members={members} onChange={handleChange} variant="compact" />
    </li>
  );
}
