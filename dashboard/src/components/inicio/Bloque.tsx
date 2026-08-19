import Link from "next/link";
import type { ListTodo } from "lucide-react";

/** Tarjeta de sección con título e (opcional) enlace a la pantalla completa. Compartida entre PersonalToday y TeamToday. */
export function Bloque({
  titulo,
  Icon,
  href,
  hrefLabel,
  tono = "normal",
  children,
}: {
  titulo: string;
  Icon: typeof ListTodo;
  href?: string;
  hrefLabel?: string;
  tono?: "normal" | "alerta";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-2 rounded-2xl border p-4 ${
        tono === "alerta" ? "border-danger/30 bg-danger-soft/40" : "border-paper-line bg-paper-raised"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          className={`flex items-center gap-1.5 font-mono text-xs font-bold tracking-[0.1em] uppercase ${
            tono === "alerta" ? "text-danger" : "text-accent"
          }`}
        >
          <Icon aria-hidden size={14} /> {titulo}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-accent-strong hover:underline"
          >
            {hrefLabel ?? "Ver todo"}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
