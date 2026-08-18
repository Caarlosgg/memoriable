import "server-only";
import type { MemberPresence, WorkspaceRole } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES } from "./categories";
import { formatEventTime } from "./format";
import { isOnline } from "./presence";
import { matchPersonaPorEmail } from "./textMatch";

/**
 * Contexto de EQUIPO del Asistente: quién es quién, qué lleva cada uno y
 * qué hay en el calendario — a lo ancho de TODOS los equipos del usuario,
 * no solo del que tenga seleccionado el selector.
 *
 * Ese "a lo ancho" es el motivo de que esto viva aparte de
 * assistantAmbient.ts (que resume solo el workspace activo): al preguntar
 * "¿qué lleva Carlos?" o "¿qué hay esta semana?", nadie piensa primero en
 * qué equipo tiene abierto — y hasta ahora el Asistente respondía "no
 * dispongo de información sobre esa persona" por estar mirando un único
 * workspace.
 *
 * Límite de acceso, en todas las funciones de este módulo: solo se
 * consultan workspaces donde el usuario que pregunta es miembro ACTIVE.
 * Nunca se filtra nada de un equipo del que no forma parte, aunque el
 * modelo lo pida por su nombre.
 */

/** Tareas que de verdad ocupan a alguien: accionables y sin terminar. */
const ESTADOS_ABIERTOS = ["POR_HACER", "EN_PROGRESO"] as const;
const TAREAS_POR_PERSONA_LIMIT = 10;
const AGENDA_LIMIT = 25;

export interface AssistantTeamSummary {
  nombre: string;
  role: WorkspaceRole;
  miembros: number;
  /** El que el usuario tiene seleccionado ahora mismo — donde se guardará lo que cree. */
  esElActivo: boolean;
  tareasAbiertas: number;
}

export interface AssistantPersonaTarea {
  resumen: string;
  estado: string;
  equipo: string;
  fechaLimite: string | null;
  vencida: boolean;
}

export interface AssistantPersonaInfo {
  email: string;
  /** En qué equipos comunes está, y con qué rol en cada uno. */
  equipos: { nombre: string; role: WorkspaceRole }[];
  enLinea: boolean;
  estado: MemberPresence;
  /** Lo que tiene marcado como "en curso ahora mismo", si hay algo. */
  trabajandoAhora: string | null;
  tareas: AssistantPersonaTarea[];
  totalTareasAbiertas: number;
  vencidas: number;
  completadasUltimaSemana: number;
  eventosProximos: { titulo: string; fecha: string; equipo: string }[];
}

export interface AssistantAgendaItem {
  tipo: "evento" | "tarea";
  titulo: string;
  fecha: string;
  equipo: string;
  /** Email de quien la lleva — null si no está asignada a nadie. */
  asignadoA: string | null;
}

/** Los workspaces de EQUIPO donde el usuario es miembro activo (el personal no cuenta: no hay nadie a quien consultar). */
async function equiposDelUsuario(userId: string): Promise<{ workspaceId: string; nombre: string; role: WorkspaceRole }[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE", workspace: { personal: false } },
    select: { workspaceId: true, role: true, workspace: { select: { nombre: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({ workspaceId: m.workspaceId, nombre: m.workspace.nombre, role: m.role }));
}

/**
 * Todos los equipos del usuario, con cuánta gente y cuánto trabajo abierto
 * hay en cada uno — para que el Asistente pueda DIFERENCIARLOS al hablar
 * ("en Obrador tienes 3 pendientes, en Asesoría ninguna") en vez de tratar
 * "el equipo" como si solo hubiera uno.
 */
export async function resolveMisEquipos(userId: string, activeWorkspaceId: string): Promise<AssistantTeamSummary[]> {
  const equipos = await equiposDelUsuario(userId);
  if (equipos.length === 0) return [];
  const ids = equipos.map((e) => e.workspaceId);

  // Dos consultas agrupadas para TODOS los equipos a la vez, en vez de dos
  // por equipo: con 4-5 equipos eso serían 10 idas y vueltas dentro de una
  // petición que ya es de las más lentas del Asistente.
  const [porEquipoMiembros, porEquipoTareas] = await Promise.all([
    prisma.membership.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids }, status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids }, categoria: { in: [...ACTIONABLE_CATEGORIES] }, estado: { in: [...ESTADOS_ABIERTOS] } },
      _count: { _all: true },
    }),
  ]);
  const miembrosPorId = new Map(porEquipoMiembros.map((g) => [g.workspaceId, g._count._all]));
  const tareasPorId = new Map(porEquipoTareas.map((g) => [g.workspaceId, g._count._all]));

  return equipos.map((e) => ({
    nombre: e.nombre,
    role: e.role,
    miembros: miembrosPorId.get(e.workspaceId) ?? 0,
    esElActivo: e.workspaceId === activeWorkspaceId,
    tareasAbiertas: tareasPorId.get(e.workspaceId) ?? 0,
  }));
}

/**
 * Ficha completa de una persona por nombre o email libre ("Carlos",
 * "carlosgallardo", su email entero): en qué equipos comunes está, si está
 * disponible, qué lleva entre manos y qué tiene por delante en el
 * calendario. Null si no comparte ningún equipo con quien pregunta — que es
 * también el límite de acceso: no se puede consultar a alguien de fuera.
 */
export async function resolvePersona(userId: string, nombre: string): Promise<AssistantPersonaInfo | null> {
  const equipos = await equiposDelUsuario(userId);
  if (equipos.length === 0) return null;
  const workspaceIds = equipos.map((e) => e.workspaceId);
  const nombrePorWorkspace = new Map(equipos.map((e) => [e.workspaceId, e.nombre]));

  const memberships = await prisma.membership.findMany({
    where: { workspaceId: { in: workspaceIds }, status: "ACTIVE" },
    select: {
      userId: true,
      workspaceId: true,
      role: true,
      presenceStatus: true,
      lastSeenAt: true,
      user: { select: { email: true } },
    },
  });

  // Una fila por (persona, equipo) — se agrupa por persona antes de buscar,
  // o "Carlos" en tres equipos aparecería tres veces como candidato.
  const porPersona = new Map<string, { email: string; filas: typeof memberships }>();
  for (const m of memberships) {
    const entry = porPersona.get(m.userId);
    if (entry) entry.filas.push(m);
    else porPersona.set(m.userId, { email: m.user.email, filas: [m] });
  }

  const candidatos = [...porPersona.entries()].map(([id, v]) => ({ userId: id, email: v.email }));
  const encontrado = matchPersonaPorEmail(nombre, candidatos);
  if (!encontrado) return null;

  const filas = porPersona.get(encontrado.userId)!.filas;
  const susWorkspaceIds = filas.map((f) => f.workspaceId);
  const now = new Date();
  const sieteDiasAtras = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [abiertas, completadas, eventos] = await Promise.all([
    prisma.message.findMany({
      where: {
        workspaceId: { in: susWorkspaceIds },
        assigneeId: encontrado.userId,
        categoria: { in: [...ACTIONABLE_CATEGORIES] },
        estado: { in: [...ESTADOS_ABIERTOS] },
      },
      select: { resumen: true, estado: true, fechaLimite: true, workspaceId: true, enProgresoPorId: true },
      // Lo que antes vence, primero; lo que no tiene fecha, al final (Postgres
      // ordena los NULL al final por defecto en ASC).
      orderBy: { fechaLimite: "asc" },
    }),
    prisma.message.count({
      where: {
        workspaceId: { in: susWorkspaceIds },
        assigneeId: encontrado.userId,
        estado: "HECHO",
        fecha: { gte: sieteDiasAtras },
      },
    }),
    prisma.evento.findMany({
      where: { workspaceId: { in: susWorkspaceIds }, assigneeId: encontrado.userId, fechaInicio: { gte: now } },
      select: { titulo: true, fechaInicio: true, workspaceId: true },
      orderBy: { fechaInicio: "asc" },
      take: 5,
    }),
  ]);

  const masReciente = filas.reduce<(typeof filas)[number] | null>((mejor, f) => {
    if (!mejor?.lastSeenAt) return f;
    if (f.lastSeenAt && f.lastSeenAt > mejor.lastSeenAt) return f;
    return mejor;
  }, null);

  return {
    email: encontrado.email,
    equipos: filas.map((f) => ({ nombre: nombrePorWorkspace.get(f.workspaceId) ?? "?", role: f.role })),
    enLinea: isOnline(masReciente?.lastSeenAt?.toISOString() ?? null),
    estado: masReciente?.presenceStatus ?? "DISPONIBLE",
    trabajandoAhora: abiertas.find((t) => t.enProgresoPorId === encontrado.userId)?.resumen ?? null,
    tareas: abiertas.slice(0, TAREAS_POR_PERSONA_LIMIT).map((t) => ({
      resumen: t.resumen,
      estado: t.estado,
      equipo: nombrePorWorkspace.get(t.workspaceId) ?? "?",
      fechaLimite: t.fechaLimite ? formatEventTime(t.fechaLimite) : null,
      vencida: t.fechaLimite != null && t.fechaLimite < now,
    })),
    totalTareasAbiertas: abiertas.length,
    vencidas: abiertas.filter((t) => t.fechaLimite != null && t.fechaLimite < now).length,
    completadasUltimaSemana: completadas,
    eventosProximos: eventos.map((e) => ({
      titulo: e.titulo,
      fecha: formatEventTime(e.fechaInicio),
      equipo: nombrePorWorkspace.get(e.workspaceId) ?? "?",
    })),
  };
}

/**
 * Qué hay entre dos fechas — citas del calendario Y tareas que vencen,
 * mezcladas y en orden cronológico, porque para quien pregunta "¿qué tengo
 * esta semana?" las dos cosas ocupan el mismo hueco del día. Cubre todos
 * los equipos del usuario más su espacio personal (a diferencia del resto
 * del módulo: la agenda propia sí incluye lo personal, es lo que uno espera
 * al preguntar por su semana).
 *
 * `dePersona` acota a lo que lleva alguien en concreto ("¿qué tiene Ana
 * esta semana?"); sin él, todo lo que el usuario puede ver.
 */
export async function resolveAgenda(
  userId: string,
  desde: Date,
  hasta: Date,
  personalWorkspaceId: string,
  dePersona?: string,
): Promise<AssistantAgendaItem[]> {
  const equipos = await equiposDelUsuario(userId);
  const nombrePorWorkspace = new Map<string, string>(equipos.map((e) => [e.workspaceId, e.nombre]));
  nombrePorWorkspace.set(personalWorkspaceId, "Personal");
  const workspaceIds = [...nombrePorWorkspace.keys()];

  let assigneeId: string | undefined;
  if (dePersona) {
    const persona = await prisma.membership.findMany({
      where: { workspaceId: { in: equipos.map((e) => e.workspaceId) }, status: "ACTIVE" },
      select: { userId: true, user: { select: { email: true } } },
    });
    const candidatos = [...new Map(persona.map((p) => [p.userId, { userId: p.userId, email: p.user.email }])).values()];
    const encontrado = matchPersonaPorEmail(dePersona, candidatos);
    // Nadie con ese nombre: se devuelve vacío en vez de ignorar el filtro y
    // soltar la agenda entera del equipo, que sería una respuesta plausible
    // pero equivocada a "¿qué tiene Ana?".
    if (!encontrado) return [];
    assigneeId = encontrado.userId;
  }

  const [eventos, tareas] = await Promise.all([
    prisma.evento.findMany({
      where: { workspaceId: { in: workspaceIds }, fechaInicio: { gte: desde, lt: hasta }, ...(assigneeId ? { assigneeId } : {}) },
      select: { titulo: true, fechaInicio: true, workspaceId: true, assignee: { select: { email: true } } },
      orderBy: { fechaInicio: "asc" },
      take: AGENDA_LIMIT,
    }),
    prisma.message.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        categoria: { in: [...ACTIONABLE_CATEGORIES] },
        estado: { in: [...ESTADOS_ABIERTOS] },
        fechaLimite: { gte: desde, lt: hasta },
        ...(assigneeId ? { assigneeId } : {}),
      },
      select: { resumen: true, fechaLimite: true, workspaceId: true, assignee: { select: { email: true } } },
      orderBy: { fechaLimite: "asc" },
      take: AGENDA_LIMIT,
    }),
  ]);

  const items: (AssistantAgendaItem & { orden: Date })[] = [
    ...eventos.map((e) => ({
      tipo: "evento" as const,
      titulo: e.titulo,
      fecha: formatEventTime(e.fechaInicio),
      equipo: nombrePorWorkspace.get(e.workspaceId) ?? "?",
      asignadoA: e.assignee?.email ?? null,
      orden: e.fechaInicio,
    })),
    ...tareas.map((t) => ({
      tipo: "tarea" as const,
      titulo: t.resumen,
      fecha: formatEventTime(t.fechaLimite!),
      equipo: nombrePorWorkspace.get(t.workspaceId) ?? "?",
      asignadoA: t.assignee?.email ?? null,
      orden: t.fechaLimite!,
    })),
  ];

  return items
    .sort((a, b) => a.orden.getTime() - b.orden.getTime())
    .slice(0, AGENDA_LIMIT)
    .map(({ orden: _orden, ...item }) => item);
}
