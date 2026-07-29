import type { Message } from "@prisma/client";
import { presentCategory } from "@/lib/categories";
import { formatDate } from "@/lib/format";
import { Highlight } from "./Highlight";

export function MessageCard({
  message,
  showCategory = true,
  highlightQuery,
  children,
}: {
  message: Pick<Message, "contenido" | "categoria" | "resumen" | "fecha">;
  showCategory?: boolean;
  /** Si se pasa, resalta las coincidencias de este término en el texto. */
  highlightQuery?: string;
  /** Slot opcional para acciones (p. ej. "marcar como hecho"). */
  children?: React.ReactNode;
}) {
  const { emoji, label } = presentCategory(message.categoria);
  const resumen = message.resumen || "(sin resumen)";

  return (
    <li className="fade-in rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {showCategory && (
        <p className="mb-1 text-xs font-medium text-slate-500">
          <span aria-hidden>{emoji}</span> {label}
        </p>
      )}
      <p className="text-sm font-medium text-slate-900">
        {highlightQuery ? (
          <Highlight text={resumen} query={highlightQuery} />
        ) : (
          resumen
        )}
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
        {highlightQuery ? (
          <Highlight text={message.contenido} query={highlightQuery} />
        ) : (
          message.contenido
        )}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{formatDate(message.fecha)}</p>
        {children}
      </div>
    </li>
  );
}
