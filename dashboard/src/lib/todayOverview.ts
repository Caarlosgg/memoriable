import "server-only";
import type { Message, Evento } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";

/**
 * Cuántas filas se traen de cada lista. La pantalla de inicio es un
 * vistazo, no un listado: si hay más, se enlaza a la pantalla que sí sabe
 * mostrarlas todas (Tablero/Calendario) en vez de crecer sin límite aquí.
 */
const LISTA_LIMIT = 5;

export interface EnCursoAhora {
  id: string;
  resumen: string;
  categoria: string;
  userId: string;
  desde: Date;
}

export interface TodayOverview {
  /** Pendientes cuya fecha límite ya pasó — lo primero que hay que ver. */
  vencidas: Message[];
  vencidasTotal: number;
  /** Pendientes que vencen HOY. */
  hoyTareas: Message[];
  hoyTareasTotal: number;
  /** Eventos de hoy, en orden. */
  hoyEventos: Evento[];
  /** Todas las tareas/recordatorios abiertos del workspace (con o sin fecha). */
  pendientesTotal: number;
  /** Quién está trabajando en algo ahora mismo — vacío en el espacio personal. */
  enCurso: EnCursoAhora[];
}

/**
 * Todo lo que la pantalla de inicio necesita, en una sola función y con
 * las consultas en paralelo: es lo primero que se pinta al entrar, así que
 * no puede ser una cascada de esperas (mismo criterio que llevó a sacar
 * los widgets del layout, ver PeripheralWidgets en (dashboard)/layout.tsx).
 *
 * Alcance por `workspaceId`, no por usuario: en un equipo, "hoy" es lo del
 * equipo — que es justo lo que hace útil esta pantalla cuando hay varias
 * personas. En el espacio personal el workspace ya es solo tuyo, así que la
 * misma consulta sirve para los dos casos sin ramificar.
 */
export async function getTodayOverview(workspaceId: string): Promise<TodayOverview> {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const finHoy = new Date(inicioHoy);
  finHoy.setDate(finHoy.getDate() + 1);

  const accionablesAbiertas = {
    workspaceId,
    categoria: { in: [...ACTIONABLE_CATEGORIES] },
    estado: { not: "HECHO" as const },
  };

  const [vencidas, vencidasTotal, hoyTareas, hoyTareasTotal, hoyEventos, pendientesTotal, enCursoRaw] =
    await Promise.all([
      prisma.message.findMany({
        where: { ...accionablesAbiertas, fechaLimite: { lt: inicioHoy } },
        orderBy: { fechaLimite: "asc" },
        take: LISTA_LIMIT,
      }),
      prisma.message.count({ where: { ...accionablesAbiertas, fechaLimite: { lt: inicioHoy } } }),
      prisma.message.findMany({
        where: { ...accionablesAbiertas, fechaLimite: { gte: inicioHoy, lt: finHoy } },
        orderBy: { fechaLimite: "asc" },
        take: LISTA_LIMIT,
      }),
      prisma.message.count({ where: { ...accionablesAbiertas, fechaLimite: { gte: inicioHoy, lt: finHoy } } }),
      prisma.evento.findMany({
        where: { workspaceId, fechaInicio: { gte: inicioHoy, lt: finHoy } },
        orderBy: { fechaInicio: "asc" },
      }),
      prisma.message.count({ where: accionablesAbiertas }),
      prisma.message.findMany({
        where: { workspaceId, enProgresoPorId: { not: null } },
        orderBy: { enProgresoDesde: "asc" },
        select: { id: true, resumen: true, categoria: true, enProgresoPorId: true, enProgresoDesde: true },
      }),
    ]);

  return {
    vencidas,
    vencidasTotal,
    hoyTareas,
    hoyTareasTotal,
    hoyEventos,
    pendientesTotal,
    enCurso: enCursoRaw.map((t) => ({
      id: t.id,
      resumen: t.resumen,
      categoria: t.categoria,
      userId: t.enProgresoPorId!,
      desde: t.enProgresoDesde ?? new Date(),
    })),
  };
}
