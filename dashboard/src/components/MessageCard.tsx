import * as React from "react";
import type { Message } from "@prisma/client";
import { Clock } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Highlight } from "./Highlight";

interface MessageCardProps extends React.LiHTMLAttributes<HTMLLIElement> {
  message: Pick<Message, "id" | "contenido" | "categoria" | "resumen" | "fecha">;
  showCategory?: boolean;
  /** Si se pasa, resalta las coincidencias de este término en el texto. */
  highlightQuery?: string;
  /** Nota citada por el Asistente y a la que se ha navegado directamente. */
  highlighted?: boolean;
}

/**
 * `forwardRef` + spread de `...rest`: necesario para que
 * `MessageDetailDialog` pueda usarla directamente como disparador de un
 * modal Radix (`DialogTrigger asChild`), que clona el hijo e inyecta
 * `onClick`/`ref`/atributos ARIA — sin esto, esos props nunca llegarían al
 * `<li>` real y el modal no se abriría al hacer clic.
 */
export const MessageCard = React.forwardRef<HTMLLIElement, MessageCardProps>(function MessageCard(
  { message, showCategory = true, highlightQuery, highlighted = false, className, ...rest },
  ref,
) {
  const { Icon, label, color } = presentCategory(message.categoria);
  const resumen = message.resumen || "(sin resumen)";

  return (
    <li
      ref={ref}
      id={`mensaje-${message.id}`}
      className={cn(
        "fade-in group scroll-mt-24 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md",
        highlighted ? "border-accent bg-accent-soft ring-2 ring-accent/40" : "border-paper-line bg-paper-raised",
        className,
      )}
      {...rest}
    >
      {showCategory && (
        <p className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${color}`}>
          <Icon aria-hidden size={14} /> {label}
        </p>
      )}
      <p className="font-display text-[1.05rem] leading-snug font-semibold text-ink">
        {highlightQuery ? (
          <Highlight text={resumen} query={highlightQuery} />
        ) : (
          resumen
        )}
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-muted">
        {highlightQuery ? (
          <Highlight text={message.contenido} query={highlightQuery} />
        ) : (
          message.contenido
        )}
      </p>
      <div className="mt-3 flex items-center gap-3 border-t border-paper-line pt-2.5">
        <p className="flex items-center gap-1 text-xs text-muted">
          <Clock aria-hidden size={12} /> {formatDate(message.fecha)}
        </p>
      </div>
    </li>
  );
});
