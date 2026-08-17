import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Prisma, WorkspaceRole, MembershipStatus, MemberPresence, EstadoTarea } from "@prisma/client";
import { prisma } from "./prisma";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

/**
 * Crea el workspace personal + membership OWNER/ACTIVE de un usuario y
 * enlaza `User.personalWorkspaceId` — pensada para llamarse dentro de la
 * MISMA transacción que el `user.create()` del flujo de alta (registro/
 * actions.ts, googleOAuth.ts), para que una cuenta nunca pueda quedar sin
 * su espacio personal ni con uno a medias si algo falla en mitad. También
 * la usa el self-heal de `getPersonalWorkspace` más abajo — un único
 * sitio que sabe crear un workspace personal, no dos copias del mismo
 * `create`+`create`+`update`.
 */
export async function createPersonalWorkspace(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const workspace = await tx.workspace.create({ data: { nombre: "Personal", personal: true } });
  await tx.membership.create({
    data: { userId, workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" },
  });
  await tx.user.update({ where: { id: userId }, data: { personalWorkspaceId: workspace.id } });
  return workspace.id;
}

export interface ActiveWorkspace {
  workspaceId: string;
  isPersonal: boolean;
  role: WorkspaceRole;
}

/**
 * Solo VIEWER no puede escribir — el resto de roles tienen los mismos
 * permisos sobre el CONTENIDO del workspace (crear/editar/asignar/borrar
 * notas y eventos); OWNER/ADMIN se diferencian únicamente en que además
 * administran el propio workspace (ver equipo/actions.ts). Un único sitio
 * para esta regla: cada Server Action de escritura la llama antes de
 * tocar la base de datos, en vez de repetir `role !== "VIEWER"` suelto en
 * cada una (y arriesgarse a que alguna se quede sin la comprobación).
 */
export function canWrite(role: WorkspaceRole): boolean {
  return role !== "VIEWER";
}

/** Mensaje consistente para toda acción de escritura rechazada por rol de solo lectura. */
export const READONLY_ROLE_MESSAGE = "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.";

/**
 * Workspace activo del usuario para esta petición: el que eligió con el
 * selector (cookie), o su personal si no ha elegido ninguno todavía, o si
 * la cookie apunta a un workspace del que ya no es miembro (se ha ido, lo
 * han echado, o la cookie se ha manipulado a mano). La cookie es SOLO una
 * preferencia de cliente — la membresía se revalida contra la base de
 * datos en cada llamada, nunca se confía en el valor de la cookie por sí
 * solo. Toda Server Action que hoy filtra `where: { id, userId }` pasa a
 * resolver el workspace aquí primero y filtrar por `workspaceId` — ver
 * el resto de `lib/` para los sitios ya migrados.
 *
 * `cache()` de React: varios Server Components de la MISMA petición
 * (layout, BoardSection, la página de calendario...) la llaman cada uno
 * por su cuenta con el mismo `userId` — sin memoización, cada uno repetía
 * la consulta a `membership`. `cache()` hace que solo la primera llamada
 * de la petición toque la base de datos; las siguientes con los mismos
 * argumentos reciben el resultado ya resuelto. Se limpia sola entre
 * peticiones (no es un caché global ni persistente).
 */
export const getActiveWorkspace = cache(async (userId: string): Promise<ActiveWorkspace> => {
  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  if (requested) {
    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: requested } },
      select: { role: true, status: true, workspace: { select: { personal: true } } },
    });
    if (membership && membership.status === "ACTIVE") {
      return { workspaceId: requested, isPersonal: membership.workspace.personal, role: membership.role };
    }
  }

  return getPersonalWorkspace(userId);
});

/**
 * Resuelve el workspace personal del usuario — lectura O(1) vía
 * `personalWorkspaceId`. Auto-curación si por lo que sea falta (no
 * debería pasar: la migración lo backfilló para las cuentas existentes,
 * y el alta de cuenta lo crea atómicamente para las nuevas — esto es una
 * red de seguridad, no la vía principal). La transacción relee antes de
 * crear: dos peticiones concurrentes del mismo usuario en este estado no
 * deben acabar creándole dos workspaces personales (el `@unique` de
 * `User.personalWorkspaceId` lo impediría igualmente a nivel de BD, pero
 * así se evita el error en vez de solo blindarse contra él).
 */
async function getPersonalWorkspace(userId: string): Promise<ActiveWorkspace> {
  const workspaceId = await getPersonalWorkspaceId(userId);
  return { workspaceId, isPersonal: true, role: "OWNER" };
}

/**
 * Resuelve el workspace personal del usuario, IGNORANDO cuál sea el
 * activo — para lo que siempre debe quedar personal pase lo que pase
 * (Ahorros, el resumen diario, las tools de ahorro del Asistente): esas
 * secciones no tienen versión "de equipo", así que no deben depender de
 * qué workspace haya elegido el selector. Mismo self-heal que
 * `getActiveWorkspace` — ver ese comentario para el porqué.
 */
export async function getPersonalWorkspaceId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personalWorkspaceId: true } });
  if (user?.personalWorkspaceId) return user.personalWorkspaceId;

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: userId }, select: { personalWorkspaceId: true } });
    if (fresh?.personalWorkspaceId) return fresh.personalWorkspaceId;
    return createPersonalWorkspace(tx, userId);
  });
}

export interface WorkspaceMemberInfo {
  userId: string;
  email: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  isSelf: boolean;
  /** Cuenta corporativa (ver addMemberByEmail) que aún no ha elegido contraseña. */
  accountPending: boolean;
  /** Estado manual (ver MemberPresence en el schema) — null = disponible por defecto. */
  presenceStatus: MemberPresence | null;
  /** Último latido de actividad — usar `isOnline()` para leerlo, no comparar a mano. */
  lastSeenAt: string | null;
}

// Reexportadas para el resto de código de servidor (assistantTools.ts) que
// ya importaba de aquí — la definición vive en lib/presence.ts, que SÍ
// puede importarse también desde Client Components (ver ese comentario).
export { isOnline, ONLINE_THRESHOLD_MS } from "./presence";

/**
 * La consulta de miembros en sí, cacheada por petición — SIN comprobar
 * que quien pregunta pertenece al workspace (eso lo sigue haciendo
 * `getWorkspaceMembers` en equipo/actions.ts, la Server Action expuesta
 * al cliente). Pensada para Server Components de esta misma petición que
 * YA tienen un `workspaceId` validado por `getActiveWorkspace` (el
 * layout, `BoardSection`, la página de calendario) — antes cada uno
 * llamaba a `getWorkspaceMembers` por su cuenta, repitiendo tanto la
 * comprobación de membership del que pregunta como esta consulta.
 */
export const listWorkspaceMembers = cache(
  async (workspaceId: string, currentUserId: string): Promise<WorkspaceMemberInfo[]> => {
    const memberships = await prisma.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { email: true, accountPending: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      role: m.role,
      status: m.status,
      isSelf: m.userId === currentUserId,
      accountPending: m.user.accountPending,
      presenceStatus: m.presenceStatus,
      lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
    }));
  },
);

/**
 * Categorías que ESTE usuario ha ocultado en Notas/Tablero de este
 * workspace — preferencia personal (columna en `Membership`, no en
 * `Workspace`), cacheada por petición igual que `listWorkspaceMembers`:
 * la piden tanto `NotesSection` como `BoardSection` en la misma
 * navegación.
 */
export const getHiddenCategories = cache(async (userId: string, workspaceId: string): Promise<string[]> => {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { hiddenCategories: true },
  });
  return membership?.hiddenCategories ?? [];
});

/**
 * Nombres personalizados de las 3 columnas del tablero de este workspace
 * (Fase Equipo) — ver `Workspace.boardLabels`. Cacheada por petición: la
 * pide tanto `BoardSection` como cualquier otro sitio que muestre las
 * columnas del tablero en la misma navegación.
 */
export const getBoardLabels = cache(async (workspaceId: string): Promise<Partial<Record<EstadoTarea, string>>> => {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { boardLabels: true } });
  return (workspace?.boardLabels as Partial<Record<EstadoTarea, string>> | null) ?? {};
});

/**
 * Comprueba si un usuario es miembro ACTIVE (no PENDING) de un workspace —
 * usado antes de asignarle una tarea o evento: asignar a alguien fuera del
 * workspace, o con una invitación aún sin aceptar, no tendría sentido (no
 * vería la tarjeta). Postgres no puede expresar esta referencia cruzada
 * (assigneeId dentro del mismo workspaceId) como constraint — se comprueba
 * aquí, a nivel de Server Action.
 */
export async function isActiveMember(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { status: true },
  });
  return membership?.status === "ACTIVE";
}

/**
 * Cambia el workspace activo del usuario — valida que sea miembro ACTIVE
 * antes de guardar la cookie (nunca se confía en el `workspaceId` que
 * pide el cliente sin comprobarlo). Devuelve `false` sin tocar la cookie
 * si la validación falla, para que quien llame pueda responder con un
 * error claro en vez de cambiar a un workspace ajeno.
 */
export async function setActiveWorkspaceCookie(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") return false;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
