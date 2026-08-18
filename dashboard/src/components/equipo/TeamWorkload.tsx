import { Inbox, CircleCheckBig } from "lucide-react";
import { getTeamWorkload } from "@/lib/teamWorkload";
import { listWorkspaceMembers, getActiveWorkspace } from "@/lib/workspace";
import { verifySession } from "@/lib/dal";
import { WorkloadRow } from "./WorkloadRow";
import { SinAsignarLink } from "./SinAsignarLink";

/**
 * Cómo está repartido el trabajo del equipo, de un vistazo.
 *
 * Estas cifras solo las sabía el Asistente (tool `analizarEquipo`): había
 * que PREGUNTARLE quién iba más cargado. Quien reparte tareas lo mira aquí,
 * en la pantalla del equipo, sin escribir nada.
 *
 * Barra proporcional a la persona más cargada, no a un total: lo que se
 * quiere ver es la COMPARACIÓN entre unos y otros ("María el doble que
 * Pedro"), no qué porcentaje del equipo lleva cada uno. El tramo rojo son
 * las vencidas — la parte de su carga que ya se ha pasado de fecha.
 *
 * Cada fila lleva al tablero filtrado por esa persona, cambiando antes de
 * equipo si hace falta (ver WorkloadRow): ver que alguien va cargado sin
 * poder mirar QUÉ lleva deja el diagnóstico a medias.
 */
export async function TeamWorkload({ workspaceId }: { workspaceId: string }) {
  const userId = await verifySession();
  const [carga, members, activo] = await Promise.all([
    getTeamWorkload(workspaceId),
    listWorkspaceMembers(workspaceId, userId),
    getActiveWorkspace(userId),
  ]);

  const activos = members.filter((m) => m.status === "ACTIVE");
  if (activos.length === 0) return null;

  const esWorkspaceActivo = activo.workspaceId === workspaceId;

  // De más cargado a menos: la pregunta real es "¿quién no da abasto?", y
  // esa persona debe estar arriba, no perdida en orden de alta.
  const filas = activos
    .map((m) => ({ member: m, carga: carga.porMiembro.get(m.userId) }))
    .sort((a, b) => (b.carga?.abiertas ?? 0) - (a.carga?.abiertas ?? 0));

  if (carga.totalAbiertas === 0) {
    return (
      <section className="rounded-2xl border border-paper-line bg-paper-raised p-5">
        <h3 className="mb-1 flex items-center gap-1.5 font-mono text-xs font-bold tracking-[0.1em] text-accent uppercase">
          <CircleCheckBig aria-hidden size={14} /> Reparto de trabajo
        </h3>
        <p className="text-sm text-muted">Nadie tiene tareas abiertas en este equipo ahora mismo.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-mono text-xs font-bold tracking-[0.1em] text-accent uppercase">
          Reparto de trabajo
        </h3>
        <p className="text-xs text-muted">
          {carga.totalAbiertas} abiertas
          {carga.totalVencidas > 0 && <span className="text-danger"> · {carga.totalVencidas} vencidas</span>}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {filas.map(({ member, carga: c }) => {
          const abiertas = c?.abiertas ?? 0;
          const vencidas = c?.vencidas ?? 0;
          const anchoTotal = (abiertas / carga.maxAbiertasPorPersona) * 100;
          // El tramo rojo es una PARTE de su carga, no algo aparte: se
          // dibuja encima, con el ancho que le corresponde dentro de la barra.
          const anchoVencidas = abiertas > 0 ? (vencidas / abiertas) * anchoTotal : 0;
          return (
            <WorkloadRow
              key={member.userId}
              workspaceId={workspaceId}
              esWorkspaceActivo={esWorkspaceActivo}
              userId={member.userId}
              email={member.email}
              esSelf={member.isSelf}
              abiertas={abiertas}
              vencidas={vencidas}
              completadasSemana={c?.completadasSemana ?? 0}
              anchoTotal={anchoTotal}
              anchoVencidas={anchoVencidas}
            />
          );
        })}
      </ul>

      {carga.sinAsignar > 0 && (
        // Lo más accionable de todo el panel: trabajo que no lleva nadie.
        <SinAsignarLink workspaceId={workspaceId} esWorkspaceActivo={esWorkspaceActivo} cuantas={carga.sinAsignar}>
          <Inbox aria-hidden size={15} />
          {carga.sinAsignar} sin asignar — nadie las lleva todavía
        </SinAsignarLink>
      )}
    </section>
  );
}
