import "server-only";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
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
  role: "OWNER" | "ADMIN" | "MEMBER";
}

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
 */
export async function getActiveWorkspace(userId: string): Promise<ActiveWorkspace> {
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
}

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
