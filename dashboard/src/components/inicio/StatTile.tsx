import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Cifra de cabecera con enlace a la pantalla que la explica.
 *
 * Es una "stat tile", no un gráfico: para un puñado de números sueltos, un
 * gráfico de una sola barra es peor que el número a secas.
 *
 * `tono` usa los colores de ESTADO, reservados (nunca se reutilizan para
 * "otra categoría más"): por eso cada baldosa lleva SIEMPRE icono y
 * etiqueta de texto, y el color solo refuerza — nadie tiene que distinguir
 * rojo de verde para entenderla.
 */
export function StatTile({
  href,
  label,
  value,
  Icon,
  tono = "neutro",
}: {
  href: string;
  label: string;
  value: number;
  Icon: LucideIcon;
  /** `alerta` solo cuando de verdad hay algo que corregir — si no, todo grita y nada destaca. */
  tono?: "neutro" | "alerta" | "bien";
}) {
  const tonos = {
    neutro: { caja: "border-paper-line bg-paper-raised hover:border-accent", icono: "text-muted", cifra: "text-ink" },
    alerta: { caja: "border-danger/40 bg-danger-soft hover:border-danger", icono: "text-danger", cifra: "text-danger" },
    bien: { caja: "border-accent/40 bg-accent-soft/50 hover:border-accent", icono: "text-accent-strong", cifra: "text-accent-strong" },
  }[tono];

  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 rounded-xl border p-4 shadow-xs transition-all duration-base hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none motion-reduce:hover:translate-y-0 ${tonos.caja}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon aria-hidden size={14} className={tonos.icono} />
        {label}
      </span>
      {/* La cifra manda: grande y tabular para que no "baile" al cambiar.
          Cuenta desde cero al aparecer (CSS puro, ver `.count-up` en
          globals.css). El número REAL va en el `sr-only`: lo que genera
          `content` no siempre lo anuncia un lector de pantalla, así que la
          parte animada es puramente visual. */}
      <span className={`font-display text-3xl leading-none font-semibold tabular-nums ${tonos.cifra}`}>
        <span className="sr-only">{value}</span>
        <span aria-hidden className="count-up" style={{ "--target": value } as React.CSSProperties} />
      </span>
    </Link>
  );
}
