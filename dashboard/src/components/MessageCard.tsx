import type { Message } from "@prisma/client";
import { presentCategory } from "@/lib/categories";
import { formatDate } from "@/lib/format";
import { Highlight } from "./Highlight";

export function MessageCard({
  message,
  showCategory = true,
  highlightQuery,
  children,
  className = "",
}: {
  message: Pick<Message, "contenido" | "categoria" | "resumen" | "fecha">;
  showCategory?: boolean;
  /** Si se pasa, resalta las coincidencias de este término en el texto. */
  highlightQuery?: string;
  /** Slot opcional para acciones (p. ej. "marcar como hecho"). */
  children?: React.ReactNode;
  /**
   * Clases extra para el <li> raíz (p. ej. la transición de salida de
   * PendingList). No envuelvas este componente en tu propio <li>: ya es uno,
   * y anidar <li> dentro de <li> es HTML inválido (rompe la hidratación).
   */
  className?: string;
}) {
  const { emoji, label } = presentCategory(message.categoria);
  const resumen = message.resumen || "(sin resumen)";

  return (
    <li
      className={`fade-in group rounded-xl border border-paper-line bg-paper-raised p-4 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      {showCategory && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent">
          <span aria-hidden>{emoji}</span> {label}
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
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-paper-line pt-2.5">
        <p className="text-xs text-muted">🕒 {formatDate(message.fecha)}</p>
        {children}
      </div>
    </li>
  );
}
