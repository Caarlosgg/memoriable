import Link from "next/link";
import { TriangleAlert, CalendarDays, ListTodo, Clock, Loader2, PenLine, Sparkles, CircleCheckBig } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, listWorkspaceMembers, canWrite } from "@/lib/workspace";
import { getTodayOverview } from "@/lib/todayOverview";
import { formatEventTime, shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { StatTile } from "./StatTile";
import { TareaAccionable } from "./TareaAccionable";

const SALUDO_FORMATTER = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });

function saludoSegunHora(hora: number): string {
  if (hora < 6) return "Buenas noches";
  if (hora < 14) return "Buenos días";
  if (hora < 21) return "Buenas tardes";
  return "Buenas noches";
}

/** Tarjeta de sección con título e (opcional) enlace a la pantalla completa. */
function Bloque({
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

/**
 * Pantalla de inicio: "hoy de un vistazo".
 *
 * Antes, entrar en la aplicación te dejaba en un chat vacío del Asistente —
 * sin saber qué tenías pendiente, qué vencía ni en qué andaba el equipo.
 * Esta pantalla es el único sitio que CRUZA las cuatro cosas (tablero,
 * calendario, equipo y chat) y enlaza a cada una: es el punto donde la
 * aplicación deja de sentirse como cuatro herramientas sueltas.
 *
 * Todo lo que muestra es real y calculado (ver getTodayOverview) — nunca
 * cifras de ejemplo.
 */
export async function TodayView() {
  const userId = await verifySession();
  const { workspaceId, isPersonal, role } = await getActiveWorkspace(userId);
  const puedeEditar = canWrite(role);
  const [overview, members] = await Promise.all([
    getTodayOverview(workspaceId),
    isPersonal ? Promise.resolve([]) : listWorkspaceMembers(workspaceId, userId).catch(() => []),
  ]);

  const ahora = new Date();
  const emailPorUsuario = new Map(members.map((m) => [m.userId, m.email]));
  const nadaHoy = overview.hoyEventos.length === 0 && overview.hoyTareas.length === 0;
  const todoEnOrden = nadaHoy && overview.vencidasTotal === 0 && overview.enCurso.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{saludoSegunHora(ahora.getHours())}</h1>
        {/* first-letter:uppercase: Intl da el día en minúscula ("lunes, 18 de agosto"). */}
        <p className="text-sm text-muted first-letter:uppercase">{SALUDO_FORMATTER.format(ahora)}</p>
      </div>

      {/* Fila de cifras: cada una lleva a la pantalla que la explica, así
          que el número no es solo información, es también el acceso. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Cada cifra lleva a SU vista, no al tablero entero: pulsar
            "Vencidas 3" y tener que volver a buscarlas a ojo era el número
            haciendo de dato pero no de acceso (ver ?vista= en
            pendientes/page.tsx). */}
        <StatTile
          href="/pendientes?vista=vencidas"
          label="Vencidas"
          value={overview.vencidasTotal}
          Icon={TriangleAlert}
          tono={overview.vencidasTotal > 0 ? "alerta" : "neutro"}
        />
        <StatTile href="/calendario" label="Hoy" value={overview.hoyTareasTotal + overview.hoyEventos.length} Icon={CalendarDays} />
        <StatTile href="/pendientes" label="Pendientes" value={overview.pendientesTotal} Icon={ListTodo} />
        {/* En personal no hay "en curso" de nadie más, y la ficha enseñaba
            un 0 fijo bajo "Tu equipo" — un número que no medía nada. Se
            cambia por algo que sí es cierto en personal: lo cerrado esta
            semana, que además es la única cifra de las cuatro que da una
            buena noticia en vez de una pendiente. */}
        {isPersonal ? (
          <StatTile
            href="/pendientes"
            label="Hechas (7 días)"
            value={overview.completadasSemana}
            Icon={CircleCheckBig}
            tono={overview.completadasSemana > 0 ? "bien" : "neutro"}
          />
        ) : (
          <StatTile
            href="/chat"
            label="En curso"
            value={overview.enCurso.length}
            Icon={Loader2}
            tono={overview.enCurso.length > 0 ? "bien" : "neutro"}
          />
        )}
      </div>

      {overview.vencidasTotal > 0 && (
        <Bloque titulo="Se te ha pasado" Icon={TriangleAlert} tono="alerta" href="/pendientes?vista=vencidas" hrefLabel="Ver las vencidas">
          <ul className="flex flex-col">
            {overview.vencidas.map((t) => (
              <TareaAccionable key={t.id} id={t.id} resumen={t.resumen} categoria={t.categoria} urgente puedeEditar={puedeEditar} />
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
              <TareaAccionable key={t.id} id={t.id} resumen={t.resumen} categoria={t.categoria} puedeEditar={puedeEditar} />
            ))}
          </ul>
        )}
      </Bloque>

      {!isPersonal && overview.enCurso.length > 0 && (
        <Bloque titulo="En curso ahora" Icon={Loader2} href="/equipo" hrefLabel="Ver equipo">
          <ul className="flex flex-col gap-1.5">
            {overview.enCurso.map((t) => {
              const email = emailPorUsuario.get(t.userId);
              return (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  {email && <Avatar email={email} size="xs" />}
                  <span className="text-muted">{email ? shortEmailName(email) : "Alguien"}</span>
                  <span className="truncate text-ink">{t.resumen}</span>
                </li>
              );
            })}
          </ul>
        </Bloque>
      )}

      {todoEnOrden && (
        <p className="rounded-2xl border border-dashed border-paper-line bg-paper-raised/60 p-6 text-center text-sm text-muted">
          Todo al día. Nada vencido ni pendiente para hoy.
        </p>
      )}

      {/* Accesos: las dos cosas que más se hacen al entrar (apuntar algo y
          preguntarle al Asistente), a un clic desde la primera pantalla. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/categorias"
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
    </div>
  );
}
