import "server-only";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";

/**
 * Reparto de trabajo de un equipo, por persona.
 *
 * Estas cifras ya existían, pero SOLO las veía el Asistente (la tool
 * `analizarEquipo`): había que preguntarle "¿quién está más cargado?" para
 * enterarte de algo que debería verse de un vistazo. Esto las saca a la
 * pantalla de equipo, que es donde alguien que reparte tareas las busca.
 *
 * Una consulta por concepto (abiertas + cerradas), no una por persona: un
 * equipo de diez no puede costar veinte idas y vueltas.
 */

export interface MemberWorkload {
  userId: string;
  pendientes: number;
  enProgreso: number;
  /** Subconjunto de las abiertas cuya fecha límite ya pasó — lo que de verdad hay que mirar. */
  vencidas: number;
  completadasSemana: number;
  /** Abiertas totales (pendientes + en progreso) — el número con el que se comparan unas personas con otras. */
  abiertas: number;
}

export interface TeamWorkload {
  porMiembro: Map<string, MemberWorkload>;
  /** Abiertas que no lleva nadie: el hueco más accionable de todos al repartir. */
  sinAsignar: number;
  totalAbiertas: number;
  totalVencidas: number;
  /** La carga individual más alta — sirve de escala para las barras (ver TeamWorkload.tsx). */
  maxAbiertasPorPersona: number;
}

function vacio(): MemberWorkload {
  return { userId: "", pendientes: 0, enProgreso: 0, vencidas: 0, completadasSemana: 0, abiertas: 0 };
}

export async function getTeamWorkload(workspaceId: string): Promise<TeamWorkload> {
  const ahora = new Date();
  const sieteDiasAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const accionables = { workspaceId, categoria: { in: [...ACTIONABLE_CATEGORIES] } };

  const [abiertas, completadas] = await Promise.all([
    prisma.message.findMany({
      where: { ...accionables, estado: { in: ["POR_HACER", "EN_PROGRESO"] } },
      select: { assigneeId: true, estado: true, fechaLimite: true },
    }),
    prisma.message.groupBy({
      by: ["assigneeId"],
      where: { ...accionables, estado: "HECHO", fecha: { gte: sieteDiasAtras } },
      _count: { _all: true },
    }),
  ]);

  const porMiembro = new Map<string, MemberWorkload>();
  const asegurar = (userId: string): MemberWorkload => {
    const existente = porMiembro.get(userId);
    if (existente) return existente;
    const nuevo = { ...vacio(), userId };
    porMiembro.set(userId, nuevo);
    return nuevo;
  };

  let sinAsignar = 0;
  let totalVencidas = 0;

  for (const t of abiertas) {
    const vencida = t.fechaLimite != null && t.fechaLimite < ahora;
    if (vencida) totalVencidas++;
    if (!t.assigneeId) {
      sinAsignar++;
      continue;
    }
    const entry = asegurar(t.assigneeId);
    if (t.estado === "EN_PROGRESO") entry.enProgreso++;
    else entry.pendientes++;
    if (vencida) entry.vencidas++;
    entry.abiertas++;
  }

  for (const g of completadas) {
    if (!g.assigneeId) continue;
    asegurar(g.assigneeId).completadasSemana = g._count._all;
  }

  return {
    porMiembro,
    sinAsignar,
    totalAbiertas: abiertas.length,
    totalVencidas,
    maxAbiertasPorPersona: Math.max(1, ...[...porMiembro.values()].map((m) => m.abiertas)),
  };
}
