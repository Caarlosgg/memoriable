"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type { WorkspaceRole, MembershipStatus } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { setActiveWorkspaceCookie } from "@/lib/workspace";

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
    include: { user: { select: { email: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({
    userId: m.userId,
    email: m.user.email,
    role: m.role,
    status: m.status,
    isSelf: m.userId === userId,
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

export interface AddMemberResult {
  error?: string;
  sent?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Añade a alguien a un equipo por email — v1 simple: solo cuentas que YA
 * existen (búsqueda por email exacto). Si no tiene cuenta, se le dice que
 * se registre primero; no hay invitación por correo/token todavía. Deja
 * el membership en PENDING: la otra persona debe aceptarlo antes de tener
 * acceso a nada del workspace.
 */
export async function addMemberByEmail(workspaceId: string, email: string): Promise<AddMemberResult> {
  const userId = await verifySession();
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) return { error: "Escribe un email válido." };

  try {
    const requester = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!requester || requester.status !== "ACTIVE" || (requester.role !== "OWNER" && requester.role !== "ADMIN")) {
      return { error: "No tienes permiso para añadir gente a este equipo." };
    }

    const target = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!target) {
      return { error: "No existe ninguna cuenta con ese email. Dile que se registre primero en MemorIAble." };
    }

    const existing = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: target.id, workspaceId } },
    });
    if (existing) {
      return { error: existing.status === "ACTIVE" ? "Ya es miembro de este equipo." : "Ya está invitado a este equipo." };
    }

    await prisma.membership.create({
      data: { userId: target.id, workspaceId, role: "MEMBER", status: "PENDING" },
    });
    revalidatePath("/equipo");
    return { sent: true };
  } catch (err) {
    console.error("Error al añadir miembro al equipo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido añadir. Inténtalo de nuevo." };
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
