import type { Message } from "@prisma/client";
import { Clock } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { formatDate } from "@/lib/format";
import { Highlight } from "./Highlight";

export function MessageCard({
  message,
  showCategory = true,
  highlightQuery,
}: {
  message: Pick<Message, "contenido" | "categoria" | "resumen" | "fecha">;
  showCategory?: boolean;
  /** Si se pasa, resalta las coincidencias de este término en el texto. */
  highlightQuery?: string;
}) {
  const { Icon, label, color } = presentCategory(message.categoria);
  const resumen = message.resumen || "(sin resumen)";

  return (
    <li className="fade-in group rounded-xl border border-paper-line bg-paper-raised p-4 shadow-sm transition-shadow hover:shadow-md">
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
}
