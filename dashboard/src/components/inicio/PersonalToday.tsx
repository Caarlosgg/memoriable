import Link from "next/link";
import { TriangleAlert, CalendarDays, ListTodo, Clock, PenLine, Sparkles, CircleCheckBig } from "lucide-react";
import { getTodayOverview } from "@/lib/todayOverview";
import { formatEventTime } from "@/lib/format";
import { StatTile } from "./StatTile";
import { TareaAccionable } from "./TareaAccionable";
import { Bloque } from "./Bloque";

/**
 * Inicio en modo PERSONAL: tu día, sin rastro de equipo. Antes esta pantalla
 * era la misma en los dos modos y llevaba una ficha "Tu equipo: 0" que no
 * medía nada estando aquí — el problema de fondo era mezclar dos públicos
 * en una sola vista. Esta es solo tuya: lo que vence y lo de hoy.
 */
export async function PersonalToday({ workspaceId }: { workspaceId: string }) {
  const overview = await getTodayOverview(workspaceId);

  const nadaHoy = overview.hoyEventos.length === 0 && overview.hoyTareas.length === 0;
  const todoEnOrden = nadaHoy && overview.vencidasTotal === 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          href="/pendientes?vista=vencidas"
          label="Vencidas"
          value={overview.vencidasTotal}
          Icon={TriangleAlert}
          tono={overview.vencidasTotal > 0 ? "alerta" : "neutro"}
        />
        <StatTile href="/calendario" label="Hoy" value={overview.hoyTareasTotal + overview.hoyEventos.length} Icon={CalendarDays} />
        <StatTile href="/pendientes" label="Pendientes" value={overview.pendientesTotal} Icon={ListTodo} />
        <StatTile
          href="/pendientes"
          label="Hechas (7 días)"
          value={overview.completadasSemana}
          Icon={CircleCheckBig}
          tono={overview.completadasSemana > 0 ? "bien" : "neutro"}
        />
      </div>

      {overview.vencidasTotal > 0 && (
        <Bloque titulo="Se te ha pasado" Icon={TriangleAlert} tono="alerta" href="/pendientes?vista=vencidas" hrefLabel="Ver las vencidas">
          <ul className="flex flex-col">
            {overview.vencidas.map((t) => (
              <TareaAccionable key={t.id} id={t.id} resumen={t.resumen} categoria={t.categoria} urgente puedeEditar />
            ))}
          </ul>
          {overview.vencidasTotal > overview.vencidas.length && (
            <p className="text-xs text-danger/80">y {overview.vencidasTotal - overview.vencidas.length} más</p>
          )}
        </Bloque>
      )}

      <Bloque titulo="Hoy" Icon={CalendarDays} href="/calendario">
        {nadaHoy ? (
          <p className="text-sm text-muted">Hoy no tienes nada con fecha. Buen momento para adelantar pendientes.</p>
        ) : (
          <ul className="flex flex-col">
            {overview.hoyEventos.map((e) => (
              <li key={e.id} className="flex items-start gap-2 py-1 text-sm">
                <Clock aria-hidden size={14} className="mt-0.5 shrink-0 text-accent" />
                <span className="shrink-0 text-xs text-muted tabular-nums">{formatEventTime(e.fechaInicio)}</span>
                <span className="text-ink">{e.titulo}</span>
              </li>
            ))}
            {overview.hoyTareas.map((t) => (
              <TareaAccionable key={t.id} id={t.id} resumen={t.resumen} categoria={t.categoria} puedeEditar />
            ))}
          </ul>
        )}
      </Bloque>

      {todoEnOrden && (
        <p className="rounded-2xl border border-dashed border-paper-line bg-paper-raised/60 p-6 text-center text-sm text-muted">
          Todo al día. Nada vencido ni pendiente para hoy.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/notas"
          className="flex items-center gap-2 rounded-xl border border-paper-line bg-paper p-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <PenLine aria-hidden size={16} className="text-accent" /> Apuntar algo
        </Link>
        <Link
          href="/asistente"
          className="flex items-center gap-2 rounded-xl border border-paper-line bg-paper p-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <Sparkles aria-hidden size={16} className="text-accent" /> Preguntar al Asistente
        </Link>
      </div>
    </>
  );
}

