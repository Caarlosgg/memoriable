"use client";

import { UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { shortEmailName } from "@/lib/format";
import type { WorkspaceMemberInfo } from "@/lib/workspace";

/**
 * Control "Asignar a…" reutilizado por la tarjeta del tablero y el detalle
 * de evento (Fase Equipo). Solo tiene sentido con más de un miembro
 * (workspace de equipo) — quien renderiza esto ya filtra por eso, ver
 * BoardSection.tsx/CalendarSection. `stopPropagation` en trigger y
 * contenido: ambos viven dentro de una tarjeta que abre un modal de
 * detalle al hacer clic, y el contenido del dropdown se monta en un
 * Portal — React sigue burbujeando el evento por el árbol de React (no el
 * del DOM), así que sin esto elegir alguien también abriría el modal.
 */
export function AssigneeControl({
  assigneeId,
  members,
  onChange,
  /**
   * "chip" (por defecto): avatar + nombre corto, para sitios con espacio
   * de sobra (el propio modal de detalle) — es el control "protagonista".
   * "compact": solo el avatar/icono, para la tarjeta del tablero, donde
   * ya compite por espacio con estado/prioridad/etiquetas.
   */
  variant = "chip",
}: {
  assigneeId: string | null;
  members: WorkspaceMemberInfo[];
  onChange: (assigneeId: string | null) => void;
  variant?: "chip" | "compact";
}) {
  const assignee = members.find((m) => m.userId === assigneeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          title={assignee ? `Asignada a ${assignee.email}` : "Sin asignar — clic para asignar"}
          aria-label={assignee ? `Asignada a ${assignee.email}. Cambiar.` : "Sin asignar. Asignar a alguien."}
          className={
            variant === "chip"
              ? "flex items-center gap-1.5 rounded-full border border-paper-line bg-paper px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              : "flex items-center gap-1 rounded-full border border-dashed border-paper-line px-1.5 py-0.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          }
        >
          {assignee ? (
            <Avatar email={assignee.email} size={variant === "chip" ? "sm" : "xs"} />
          ) : (
            <UserPlus aria-hidden size={variant === "chip" ? 13 : 11} />
          )}
          {variant === "chip" && <span className="truncate">{assignee ? shortEmailName(assignee.email) : "Asignar"}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel>Asignar a</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange(null)}>Sin asignar</DropdownMenuItem>
        <DropdownMenuSeparator />
        {members.map((m) => (
          <DropdownMenuItem key={m.userId} onSelect={() => onChange(m.userId)}>
            <Avatar email={m.email} size="xs" />
            <span className="truncate">{m.email}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
