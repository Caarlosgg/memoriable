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

export const PRESENCE_DOT: Record<MemberPresence, string> = {
  DISPONIBLE: "text-accent",
  OCUPADO: "text-danger",
  FUERA: "text-muted",
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
          className="flex items-center gap-1.5 rounded-full border border-paper-line bg-paper px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-60"
        >
          <Circle aria-hidden size={9} className={`${PRESENCE_DOT[value]} fill-current`} />
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
