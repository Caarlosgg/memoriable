import { BarChart3, Flame } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { getInsights } from "@/lib/insights";
import { formatCentimos } from "@/lib/money";

const WEEKDAY_MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });

/**
 * "Tu actividad" (Tier 2.7): tres vistazos rápidos sobre datos que ya
 * existen — nada de pipeline de analítica nuevo, ver lib/insights.ts.
 * Barras hechas a mano con Tailwind, mismo criterio que el grid del
 * calendario: sin librería de gráficos de terceros para algo tan simple.
 */
export async function InsightsSection() {
  const userId = await verifySession();
  const insights = await getInsights(userId);

  const hasActivity =
    insights.notesByWeek.some((w) => w.count > 0) || insights.savingsEvolution.some((p) => p.balanceCentimos !== 0);

  if (!hasActivity) {
    return (
      <section aria-labelledby="insights-heading" className="flex flex-col gap-4">
        <Heading />
        <div className="rounded-2xl border border-dashed border-paper-line bg-paper-raised/60 p-6 text-center">
          <p className="text-sm text-muted">
            Todavía no hay suficiente actividad guardada para mostrar nada aquí.
          </p>
        </div>
      </section>
    );
  }

  const maxNotes = Math.max(1, ...insights.notesByWeek.map((w) => w.count));
  const maxBalance = Math.max(1, ...insights.savingsEvolution.map((p) => Math.abs(p.balanceCentimos)));

  return (
    <section aria-labelledby="insights-heading" className="flex flex-col gap-4">
      <Heading />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
          <p className="mb-3 text-sm font-medium text-ink">Guardado por semana</p>
          <div className="flex h-24 items-end gap-2">
            {insights.notesByWeek.map((w) => (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-accent transition-[height]"
                  style={{ height: `${(w.count / maxNotes) * 100}%` }}
                  role="img"
                  aria-label={`Semana del ${WEEKDAY_MONTH_FORMATTER.format(new Date(w.weekStart))}: ${w.count} guardadas`}
                />
                <span className="text-[10px] text-muted">{w.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
          <p className="mb-1 text-sm font-medium text-ink">Racha de ahorro</p>
          <p className="flex items-center gap-1.5 font-display text-2xl text-ink">
            <Flame
              aria-hidden
              size={20}
              className={insights.savingsStreak > 0 ? "text-highlight-strong" : "text-muted"}
            />
            {insights.savingsStreak} {insights.savingsStreak === 1 ? "semana" : "semanas"}
          </p>
          <p className="text-xs text-muted">seguidas ahorrando más de lo que retiras</p>
        </div>

        <div className="rounded-2xl border border-paper-line bg-paper-raised p-5 sm:col-span-2">
          <p className="mb-3 text-sm font-medium text-ink">Evolución del ahorro</p>
          <div className="flex h-24 items-end gap-2">
            {insights.savingsEvolution.map((p) => (
              <div key={p.month} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t transition-[height] ${p.balanceCentimos >= 0 ? "bg-highlight" : "bg-danger/60"}`}
                  style={{ height: `${Math.max(2, (Math.abs(p.balanceCentimos) / maxBalance) * 100)}%` }}
                  role="img"
                  aria-label={`${MONTH_FORMATTER.format(new Date(`${p.month}-01`))}: ${formatCentimos(p.balanceCentimos)}`}
                />
                <span className="text-[10px] text-muted capitalize">{MONTH_FORMATTER.format(new Date(`${p.month}-01`))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Heading() {
  return (
    <h2
      id="insights-heading"
      className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
    >
      <BarChart3 aria-hidden size={14} /> Tu actividad
    </h2>
  );
}
