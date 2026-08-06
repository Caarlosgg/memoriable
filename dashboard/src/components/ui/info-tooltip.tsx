"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Icono de ayuda contextual: un "?" que al pulsarlo (o pasar el ratón)
 * explica qué es y para qué sirve el apartado en el que está. Popover en
 * vez de un simple `title` (tooltip nativo): funciona igual de bien con
 * tap en móvil, donde no existe el hover — importante porque BottomTabs
 * demuestra que este dashboard se usa también desde el móvil.
 */
export function InfoTooltip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Ayuda sobre este apartado"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
            className,
          )}
        >
          <CircleHelp aria-hidden size={16} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="popover-content z-50 w-72 rounded-xl border border-paper-line bg-paper-raised p-3.5 text-sm text-ink shadow-[0_20px_40px_-28px_rgba(28,27,24,0.4)] outline-none"
        >
          {children}
          <PopoverPrimitive.Arrow className="fill-paper-raised" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
