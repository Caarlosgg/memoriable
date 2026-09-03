import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hueco vacío con salida. Trece pantallas repetían a mano el mismo patrón
 * (`border-dashed … text-center text-muted`) con radios y paddings ya
 * divergidos — y varias se quedaban en una frase suelta sin nada que
 * pulsar, que es justo cuando un estado vacío deja de ayudar.
 *
 * Por eso `action` está en la firma: un vacío sin acción es un callejón.
 */
export function EmptyState({
  Icon,
  title,
  description,
  action,
  className,
}: {
  Icon?: LucideIcon;
  title: string;
  description?: string;
  /** Botón o enlace que saca del vacío — lo que convierte el hueco en un primer paso. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fade-in flex flex-col items-center gap-3 rounded-xl border border-dashed border-paper-line bg-paper-raised/60 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && <Icon aria-hidden size={26} className="text-muted" />}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
