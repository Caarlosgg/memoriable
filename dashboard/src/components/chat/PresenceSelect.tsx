"use client";

import { useTransition } from "react";
import { Circle } from "lucide-react";
import type { MemberPresence } from "@prisma/client";
import { setPresenceStatus } from "@/app/(dashboard)/equipo/actions";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

export const PRESENCE_LABEL: Record<MemberPresence, string> = {
  DISPONIBLE: "Disponible",
  OCUPADO: "Ocupado",
  FUERA: "Fuera",
};

/** Color del punto/icono — se usa suelto en sitios pequeños (TeamPresenceStrip). */
export const PRESENCE_DOT: Record<MemberPresence, string> = {
  DISPONIBLE: "text-accent-strong",
  OCUPADO: "text-danger",
  FUERA: "text-muted",
};

/** Pastilla de fondo + texto a juego — más visible que el punto suelto, mismo criterio que ESTADO_PRESENTATION/PRIORIDAD_PRESENTATION (lib/kanban.ts): reutiliza los mismos tokens de color, sin inventar ninguno nuevo. */
export const PRESENCE_BADGE: Record<MemberPresence, string> = {
  DISPONIBLE: "bg-accent-soft text-accent-strong",
  OCUPADO: "bg-danger-soft text-danger",
  FUERA: "bg-paper-line/60 text-muted",
};

const OPTIONS: MemberPresence[] = ["DISPONIBLE", "OCUPADO", "FUERA"];

/** Selector del propio estado ("Disponible"/"Ocupado"/"Fuera") — null se trata como Disponible (el valor por defecto, sin obligar a elegir). */
export function PresenceSelect({ current }: { current: MemberPresence | null }) {
  const [pending, startTransition] = useTransition();
  const value = current ?? "DISPONIBLE";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-[filter] hover:brightness-95 disabled:opacity-60 ${PRESENCE_BADGE[value]}`}
        >
          <Circle aria-hidden size={9} className="fill-current" />
          {PRESENCE_LABEL[value]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {OPTIONS.map((status) => (
          <DropdownMenuItem
            key={status}
            onSelect={() =>
              startTransition(() => {
                void setPresenceStatus(status);
              })
            }
          >
            <Circle aria-hidden size={9} className={`${PRESENCE_DOT[status]} fill-current`} />
            {PRESENCE_LABEL[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
