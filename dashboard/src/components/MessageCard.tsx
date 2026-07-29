import type { Message } from "@prisma/client";
import { presentCategory } from "@/lib/categories";
import { formatDate } from "@/lib/format";

export function MessageCard({
  message,
  showCategory = true,
  children,
}: {
  message: Pick<Message, "contenido" | "categoria" | "resumen" | "fecha">;
  showCategory?: boolean;
  /** Slot opcional para acciones (p. ej. "marcar como hecho"). */
  children?: React.ReactNode;
}) {
  const { emoji, label } = presentCategory(message.categoria);

  return (
    <li className="fade-in rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {showCategory && (
        <p className="mb-1 text-xs font-medium text-slate-500">
          <span aria-hidden>{emoji}</span> {label}
        </p>
      )}
      <p className="text-sm font-medium text-slate-900">
        {message.resumen || "(sin resumen)"}
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
        {message.contenido}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{formatDate(message.fecha)}</p>
        {children}
      </div>
    </li>
  );
}
