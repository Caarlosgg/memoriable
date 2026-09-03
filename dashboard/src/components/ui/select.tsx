import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Desplegable del sistema de diseño. Había 19 `<select>` crudos y el string
 * de clases (`SELECT_CLASSNAME`) copiado en tres archivos... que ya habían
 * divergido: `px-2.5 py-2` en uno y `px-3 py-2.5` en los otros dos, pese al
 * comentario que decía "para que todos los selects se vean igual".
 *
 * `<select>` nativo a propósito, no un Listbox de Radix: en móvil abre el
 * selector del sistema (rueda en iOS, diálogo en Android), que es más rápido
 * y accesible que cualquier reimplementación. Solo se le pone encima el
 * chevron, porque la flecha nativa no se puede estilar.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative inline-flex w-full">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none rounded-md border border-paper-line bg-paper py-2.5 pr-9 pl-3 text-sm text-ink outline-none transition-colors duration-fast",
            "hover:border-accent/60 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          size={15}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        />
      </div>
    );
  },
);
