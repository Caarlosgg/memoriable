"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type { WorkspaceRole, MembershipStatus } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { setActiveWorkspaceCookie, createPersonalWorkspace } from "@/lib/workspace";
import { createNotification } from "@/lib/notifications";
import { createPasswordResetToken } from "@/lib/passwordReset";
import { sendAccountSetupEmail, resolveBaseUrl } from "@/lib/email";

export interface WorkspaceSummary {
  id: string;
  nombre: string;
  personal: boolean;
  role: WorkspaceRole;
  status: MembershipStatus;
}

/**
 * Workspaces del usuario (para el selector del Sidebar): el personal
 * primero, luego los de equipo por antigüedad de alta. Incluye los
 * PENDING (invitaciones sin aceptar todavía) — el selector los muestra
 * como aviso, no como opción activable hasta que se acepten.
 */
export async function listMyWorkspaces(): Promise<WorkspaceSummary[]> {
  const userId = await verifySession();
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: [{ workspace: { personal: "desc" } }, { joinedAt: "asc" }],
  });
  return memberships.map((m) => ({
    id: m.workspaceId,
    nombre: m.workspace.nombre,
    personal: m.workspace.personal,
    role: m.role,
    status: m.status,
  }));
}

export interface WorkspaceMemberInfo {
  userId: string;
  email: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  isSelf: boolean;
  /** Cuenta corporativa (ver addMemberByEmail) que aún no ha elegido contraseña. */
  accountPending: boolean;
}

/** Lista de miembros de un workspace, para la página /equipo. Lanza si el usuario que pregunta no pertenece a él. */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]> {
  const userId = await verifySession();
  const requester = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!requester) throw new Error("No perteneces a este workspace.");

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
    isSelf: m.userId === userId,
    accountPending: m.user.accountPending,
  }));
}

export interface CreateWorkspaceResult {
  error?: string;
  workspaceId?: string;
}

const MAX_NOMBRE_LENGTH = 60;

/** Crea un equipo nuevo (workspace no personal) con quien lo crea como OWNER. */
export async function createWorkspace(nombre: string): Promise<CreateWorkspaceResult> {
  const userId = await verifySession();
  const trimmed = nombre.trim();
  if (!trimmed) return { error: "Escribe un nombre para el equipo." };
  if (trimmed.length > MAX_NOMBRE_LENGTH) {
    return { error: `El nombre no puede tener más de ${MAX_NOMBRE_LENGTH} caracteres.` };
  }

  try {
    const workspaceId = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: { nombre: trimmed, personal: false } });
      await tx.membership.create({
        data: { userId, workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" },
      });
      return workspace.id;
    });
    revalidatePath("/equipo");
    return { workspaceId };
  } catch (err) {
    console.error("Error al crear el equipo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido crear el equipo. Inténtalo de nuevo." };
  }
}

export interface RenameWorkspaceResult {
  error?: string;
}

/** Renombra un equipo — solo owner/admin. El espacio personal no se puede renombrar desde aquí (siempre se llama "Personal"). */
export async function renameWorkspace(workspaceId: string, nombre: string): Promise<RenameWorkspaceResult> {
  const userId = await verifySession();
  const trimmed = nombre.trim();
  if (!trimmed) return { error: "Escribe un nombre para el equipo." };
  if (trimmed.length > MAX_NOMBRE_LENGTH) {
    return { error: `El nombre no puede tener más de ${MAX_NOMBRE_LENGTH} caracteres.` };
  }

  try {
    const requester = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!requester || requester.status !== "ACTIVE" || (requester.role !== "OWNER" && requester.role !== "ADMIN")) {
      return { error: "No tienes permiso para renombrar este equipo." };
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { personal: true } });
    if (!workspace || workspace.personal) return { error: "No se ha encontrado ese equipo." };

    await prisma.workspace.update({ where: { id: workspaceId }, data: { nombre: trimmed } });
    revalidatePath("/equipo");
    revalidatePath("/", "layout");
    return {};
  } catch (err) {
    console.error("Error al renombrar el equipo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido renombrar. Inténtalo de nuevo." };
  }
}

export interface AddMemberResult {
  error?: string;
  sent?: boolean;
  /** true si se ha creado una cuenta nueva (corporativa) — la UI lo dice explícitamente, distinto de invitar a alguien que ya existía. */
  accountCreated?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASSIGNABLE_ROLES: WorkspaceRole[] = ["MEMBER", "ADMIN"];

/**
 * Añade a alguien a un equipo por email, con el rol elegido por quien
 * invita (MEMBER o ADMIN — OWNER no se asigna por aquí, es un caso aparte
 * de transferencia de propiedad que no cubre esta fase). Dos caminos:
 *
 * - Ya tiene cuenta: se crea un Membership PENDING con ese rol — sigue
 *   necesitando aceptar, igual que antes (respeta que esa persona ya
 *   tenía su propia cuenta y no eligió unirse).
 * - NO tiene cuenta ("cuenta corporativa"): se crea la cuenta entera
 *   (con su workspace personal, como cualquier alta) + un Membership YA
 *   ACTIVE con ese rol — no hay nada que "aceptar", unirse es implícito
 *   en que el owner/admin decidió crear la cuenta para eso. Se manda un
 *   correo para que elija contraseña y así active la cuenta (reutiliza
 *   el mismo token/página que "olvidé mi contraseña" — ver email.ts).
 */
export async function addMemberByEmail(
  workspaceId: string,
  email: string,
  role: WorkspaceRole = "MEMBER",
): Promise<AddMemberResult> {
  const userId = await verifySession();
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) return { error: "Escribe un email válido." };
  if (!ASSIGNABLE_ROLES.includes(role)) return { error: "Ese rol no se puede asignar así." };

  try {
    const requester = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!requester || requester.status !== "ACTIVE" || (requester.role !== "OWNER" && requester.role !== "ADMIN")) {
      return { error: "No tienes permiso para añadir gente a este equipo." };
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { nombre: true } });
    if (!workspace) return { error: "No se ha encontrado el equipo." };

    const target = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (target) {
      const existing = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: target.id, workspaceId } },
      });
      if (existing) {
        return { error: existing.status === "ACTIVE" ? "Ya es miembro de este equipo." : "Ya está invitado a este equipo." };
      }

      await prisma.membership.create({ data: { userId: target.id, workspaceId, role, status: "PENDING" } });
      await createNotification({
        userId: target.id,
        type: "ADDED_TO_TEAM",
        title: `Te han invitado al equipo "${workspace.nombre}"`,
        body: "Acepta la invitación desde el selector de espacios para empezar a colaborar.",
        link: "/equipo",
      }).catch((err) => console.error("No se pudo crear la notificación de invitación (no crítico):", err));

      revalidatePath("/equipo");
      return { sent: true };
    }

    // Cuenta corporativa: no existía, se crea entera + workspace personal +
    // membership ya activa, en una única transacción (mismo criterio que
    // registro/actions.ts: nunca debe quedar un User a medias).
    const newUserId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: normalizedEmail, emailVerified: true, accountPending: true },
      });
      await createPersonalWorkspace(tx, user.id);
      await tx.membership.create({ data: { userId: user.id, workspaceId, role, status: "ACTIVE" } });
      return user.id;
    });

    try {
      const setupToken = await createPasswordResetToken(newUserId);
      const baseUrl = await resolveBaseUrl();
      await sendAccountSetupEmail(normalizedEmail, `${baseUrl}/restablecer-password?token=${setupToken}`, workspace.nombre);
    } catch (err) {
      console.error("Cuenta corporativa creada pero falló el envío del correo de activación:", err);
      Sentry.captureException(err);
    }
    await createNotification({
      userId: newUserId,
      type: "ADDED_TO_TEAM",
      title: `Te han añadido al equipo "${workspace.nombre}"`,
      body: "Activa tu cuenta desde el enlace que te hemos mandado por email.",
      link: "/equipo",
    }).catch((err) => console.error("No se pudo crear la notificación de alta (no crítico):", err));

    revalidatePath("/equipo");
    return { sent: true, accountCreated: true };
  } catch (err) {
    console.error("Error al añadir miembro al equipo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido añadir. Inténtalo de nuevo." };
  }
}

/**
 * Cambia el rol de un miembro ya activo. No se puede usar para asignar
 * OWNER (transferencia de propiedad, fuera de esta fase) ni para
 * cambiarte el rol a ti mismo (evita que un owner se autodegrade y se
 * quede sin poder deshacerlo).
 */
export async function changeRole(
  workspaceId: string,
  targetUserId: string,
  role: WorkspaceRole,
): Promise<MembershipActionResult> {
  const userId = await verifySession();
  if (!ASSIGNABLE_ROLES.includes(role)) return { error: "Ese rol no se puede asignar así." };
  if (targetUserId === userId) return { error: "No puedes cambiarte el rol a ti mismo." };

  try {
    const requester = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!requester || requester.status !== "ACTIVE" || (requester.role !== "OWNER" && requester.role !== "ADMIN")) {
      return { error: "No tienes permiso para cambiar roles en este equipo." };
    }

    const result = await prisma.membership.updateMany({
      where: { userId: targetUserId, workspaceId, status: "ACTIVE", role: { not: "OWNER" } },
      data: { role },
    });
    if (result.count === 0) return { error: "No se ha encontrado a esa persona en el equipo." };

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { nombre: true } });
    await createNotification({
      userId: targetUserId,
      type: "ROLE_CHANGED",
      title: `Tu rol en "${workspace?.nombre ?? "el equipo"}" ha cambiado`,
      body: `Ahora eres ${role === "ADMIN" ? "administrador/a" : "miembro"}.`,
      link: "/equipo",
    }).catch((err) => console.error("No se pudo crear la notificación de cambio de rol (no crítico):", err));

    revalidatePath("/equipo");
    return {};
  } catch (err) {
    console.error("Error al cambiar el rol:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido cambiar el rol. Inténtalo de nuevo." };
  }
}

/**
 * Saca a alguien del equipo. No te puedes quitar a ti mismo por aquí (para
 * eso está `leaveWorkspace`, con su propio guardado), ni al último OWNER
 * (el equipo se quedaría sin nadie que pueda administrarlo). Limpia
 * también cualquier tarea/evento que tuviera asignado en este workspace —
 * quedaría asignado a alguien que ya no puede verlo.
 */
export async function removeMember(workspaceId: string, targetUserId: string): Promise<MembershipActionResult> {
  const userId = await verifySession();
  if (targetUserId === userId) return { error: "No puedes quitarte a ti mismo del equipo." };

  try {
    const [requester, target] = await Promise.all([
      prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } }),
      prisma.membership.findUnique({ where: { userId_workspaceId: { userId: targetUserId, workspaceId } } }),
    ]);
    if (!requester || requester.status !== "ACTIVE" || (requester.role !== "OWNER" && requester.role !== "ADMIN")) {
      return { error: "No tienes permiso para quitar gente de este equipo." };
    }
    if (!target) return { error: "Esa persona no está en el equipo." };

    if (target.role === "OWNER") {
      const otherOwners = await prisma.membership.count({
        where: { workspaceId, role: "OWNER", status: "ACTIVE", userId: { not: targetUserId } },
      });
      if (otherOwners === 0) return { error: "No puedes quitar al único propietario del equipo." };
    }

    await prisma.$transaction([
      prisma.membership.delete({ where: { userId_workspaceId: { userId: targetUserId, workspaceId } } }),
      prisma.message.updateMany({ where: { workspaceId, assigneeId: targetUserId }, data: { assigneeId: null } }),
      prisma.evento.updateMany({ where: { workspaceId, assigneeId: targetUserId }, data: { assigneeId: null } }),
    ]);

    revalidatePath("/equipo");
    revalidatePath("/pendientes");
    revalidatePath("/calendario");
    return {};
  } catch (err) {
    console.error("Error al quitar del equipo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido quitar. Inténtalo de nuevo." };
  }
}

/**
 * Salir de un equipo por decisión propia — el "otro lado" de `removeMember`
 * (que deliberadamente no te deja quitarte a ti mismo). Mismo guardado que
 * ahí: no puedes salir si eres el único OWNER activo (transfiere la
 * propiedad a otra persona primero, o elimina el equipo). No se puede usar
 * sobre el workspace personal — ahí no hay "equipo" del que salir.
 */
export async function leaveWorkspace(workspaceId: string): Promise<MembershipActionResult> {
  const userId = await verifySession();

  try {
    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { role: true, status: true, workspace: { select: { personal: true } } },
    });
    if (!membership || membership.status !== "ACTIVE") return { error: "No perteneces a este equipo." };
    if (membership.workspace.personal) return { error: "No puedes salir de tu espacio personal." };

    if (membership.role === "OWNER") {
      const otherOwners = await prisma.membership.count({
        where: { workspaceId, role: "OWNER", status: "ACTIVE", userId: { not: userId } },
      });
      if (otherOwners === 0) {
        return { error: "Eres el único propietario de este equipo. Asigna otro propietario o elimina el equipo antes de salir." };
      }
    }

    await prisma.$transaction([
      prisma.membership.delete({ where: { userId_workspaceId: { userId, workspaceId } } }),
      prisma.message.updateMany({ where: { workspaceId, assigneeId: userId }, data: { assigneeId: null } }),
      prisma.evento.updateMany({ where: { workspaceId, assigneeId: userId }, data: { assigneeId: null } }),
    ]);

    revalidatePath("/", "layout");
    return {};
  } catch (err) {
    console.error("Error al salir del equipo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido salir del equipo. Inténtalo de nuevo." };
  }
}

export interface MembershipActionResult {
  error?: string;
}

/** Acepta una invitación pendiente propia — PENDING → ACTIVE. */
export async function acceptMembership(workspaceId: string): Promise<MembershipActionResult> {
  const userId = await verifySession();
  try {
    const result = await prisma.membership.updateMany({
      where: { userId, workspaceId, status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    if (result.count === 0) return { error: "No se ha encontrado esa invitación." };
    revalidatePath("/", "layout");
    return {};
  } catch (err) {
    console.error("Error al aceptar la invitación:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido aceptar. Inténtalo de nuevo." };
  }
}

/** Rechaza una invitación pendiente propia — borra el membership PENDING. */
export async function declineMembership(workspaceId: string): Promise<MembershipActionResult> {
  const userId = await verifySession();
  try {
    const result = await prisma.membership.deleteMany({ where: { userId, workspaceId, status: "PENDING" } });
    if (result.count === 0) return { error: "No se ha encontrado esa invitación." };
    revalidatePath("/", "layout");
    return {};
  } catch (err) {
    console.error("Error al rechazar la invitación:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido rechazar. Inténtalo de nuevo." };
  }
}

/** Cambia el workspace activo (selector del Sidebar). Revalida todo el layout: cada sección lee datos de ese workspace. */
export async function setActiveWorkspace(workspaceId: string): Promise<MembershipActionResult> {
  const userId = await verifySession();
  const ok = await setActiveWorkspaceCookie(userId, workspaceId);
  if (!ok) return { error: "No perteneces a ese workspace." };
  revalidatePath("/", "layout");
  return {};
}
