"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { requireSuperAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/passwordReset";
import { eliminarCuenta } from "@/lib/eliminarCuenta";
import { sendPasswordResetEmail, resolveBaseUrl } from "@/lib/email";

/**
 * Server Actions del panel de administración global (/admin) — gestión de
 * TODOS los usuarios/equipos de la aplicación, no solo los propios (eso ya
 * lo cubre equipo/actions.ts). Cada función empieza por `requireSuperAdmin`,
 * que redirige fuera si quien llama no tiene `User.isSuperAdmin`.
 */

export interface AdminStats {
  totalUsers: number;
  totalWorkspaces: number;
  totalTeamWorkspaces: number;
  totalMessages: number;
  totalEventos: number;
  signupsLast7Days: number;
}

/** Cifras globales para el panel principal de /admin. */
export async function getAdminStats(): Promise<AdminStats> {
  await requireSuperAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [totalUsers, totalWorkspaces, totalTeamWorkspaces, totalMessages, totalEventos, signupsLast7Days] =
    await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.workspace.count({ where: { personal: false } }),
      prisma.message.count(),
      prisma.evento.count(),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);
  return { totalUsers, totalWorkspaces, totalTeamWorkspaces, totalMessages, totalEventos, signupsLast7Days };
}

export interface AdminUserRow {
  id: string;
  email: string;
  emailVerified: boolean;
  accountPending: boolean;
  isSuperAdmin: boolean;
  hasPassword: boolean;
  telegramLinked: boolean;
  membershipCount: number;
  isSelf: boolean;
  createdAt: Date;
}

/** Lista de usuarios de toda la aplicación, opcionalmente filtrada por email (contiene, insensible a mayúsculas). */
export async function listAdminUsers(query?: string): Promise<AdminUserRow[]> {
  const selfId = await requireSuperAdmin();
  const trimmed = query?.trim();
  const users = await prisma.user.findMany({
    where: trimmed ? { email: { contains: trimmed, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      accountPending: true,
      isSuperAdmin: true,
      passwordHash: true,
      telegramChatId: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
    take: 200,
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    accountPending: u.accountPending,
    isSuperAdmin: u.isSuperAdmin,
    hasPassword: Boolean(u.passwordHash),
    telegramLinked: u.telegramChatId !== null,
    membershipCount: u._count.memberships,
    isSelf: u.id === selfId,
    createdAt: u.createdAt,
  }));
}

export interface AdminWorkspaceRow {
  id: string;
  nombre: string;
  personal: boolean;
  memberCount: number;
  messageCount: number;
  eventoCount: number;
  createdAt: Date;
}

/** Lista de todos los workspaces (personales y de equipo) de la aplicación. */
export async function listAdminWorkspaces(): Promise<AdminWorkspaceRow[]> {
  await requireSuperAdmin();
  const workspaces = await prisma.workspace.findMany({
    orderBy: [{ personal: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      nombre: true,
      personal: true,
      createdAt: true,
      _count: { select: { memberships: true, messages: true, eventos: true } },
    },
    take: 200,
  });
  return workspaces.map((w) => ({
    id: w.id,
    nombre: w.nombre,
    personal: w.personal,
    memberCount: w._count.memberships,
    messageCount: w._count.messages,
    eventoCount: w._count.eventos,
    createdAt: w.createdAt,
  }));
}

export interface AdminActionResult {
  error?: string;
}

/**
 * Fuerza el restablecimiento de contraseña de cualquier usuario: crea un
 * token y le manda el enlace por email — igual que "olvidé mi contraseña",
 * pero iniciado por un superadmin. Nunca genera ni muestra la contraseña
 * en claro, y el propio superadmin tampoco llega a ver el token: solo el
 * dueño de la cuenta, a través de su correo, puede completarlo.
 */
export async function adminResetUserPassword(targetUserId: string): Promise<AdminActionResult> {
  await requireSuperAdmin();
  try {
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
    if (!target) return { error: "No se ha encontrado ese usuario." };

    const token = await createPasswordResetToken(targetUserId);
    const baseUrl = await resolveBaseUrl();
    const sent = await sendPasswordResetEmail(target.email, `${baseUrl}/restablecer-password?token=${token}`);
    if (!sent) return { error: "No se ha podido enviar el correo. Inténtalo de nuevo." };
    return {};
  } catch (err) {
    console.error("Error al forzar el restablecimiento de contraseña:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido iniciar el restablecimiento. Inténtalo de nuevo." };
  }
}

/** Marca (o desmarca) el email de un usuario como verificado a mano — soporte para cuentas atascadas por un envío de correo fallido. */
export async function adminSetEmailVerified(targetUserId: string, verified: boolean): Promise<AdminActionResult> {
  await requireSuperAdmin();
  try {
    await prisma.user.update({ where: { id: targetUserId }, data: { emailVerified: verified } });
    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    console.error("Error al cambiar la verificación de email:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido actualizar. Inténtalo de nuevo." };
  }
}

/** Concede o retira acceso al panel de administración. No se puede aplicar a uno mismo (evita que un superadmin se quede fuera sin querer). */
export async function adminSetSuperAdmin(targetUserId: string, value: boolean): Promise<AdminActionResult> {
  const selfId = await requireSuperAdmin();
  if (targetUserId === selfId) return { error: "No puedes cambiarte este permiso a ti mismo." };
  try {
    await prisma.user.update({ where: { id: targetUserId }, data: { isSuperAdmin: value } });
    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    console.error("Error al cambiar el permiso de administrador:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido actualizar. Inténtalo de nuevo." };
  }
}

/**
 * Elimina una cuenta entera desde el panel de administración.
 *
 * La política de borrado (qué se borra, qué lo bloquea y por qué) vive en
 * `lib/eliminarCuenta.ts`, compartida con el borrado que hace el propio
 * usuario desde "Cuenta": dos implementaciones de un borrado en cascada
 * acabarían separándose, y ahí las consecuencias son filas huérfanas o
 * datos de más borrados.
 */
export async function adminDeleteUser(targetUserId: string): Promise<AdminActionResult> {
  const selfId = await requireSuperAdmin();
  // Un superadmin borrándose a sí mismo desde aquí se quedaría sin sesión a
  // media pantalla de administración: para eso está el borrado normal de
  // /cuenta, que además pide confirmar la contraseña.
  if (targetUserId === selfId) return { error: "Para borrar tu propia cuenta, ve a «Cuenta»." };

  try {
    const result = await eliminarCuenta(targetUserId);
    if (result.error) return result;

    revalidatePath("/admin/usuarios");
    revalidatePath("/admin");
    return {};
  } catch (err) {
    console.error("Error al eliminar el usuario:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido eliminar. Inténtalo de nuevo." };
  }
}

/**
 * Elimina un equipo entero (no un espacio personal — eso no se hace desde
 * aquí). Igual que arriba: rechaza si todavía tiene notas o eventos, en
 * vez de arrastrarlos — quien administra decide primero qué hacer con ese
 * contenido.
 */
export async function adminDeleteWorkspace(workspaceId: string): Promise<AdminActionResult> {
  await requireSuperAdmin();
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { personal: true } });
    if (!workspace) return { error: "No se ha encontrado ese equipo." };
    if (workspace.personal) return { error: "No se puede eliminar un espacio personal desde aquí." };

    const [messageCount, eventoCount] = await Promise.all([
      prisma.message.count({ where: { workspaceId } }),
      prisma.evento.count({ where: { workspaceId } }),
    ]);
    if (messageCount + eventoCount > 0) {
      return { error: "Este equipo todavía tiene notas o eventos. Bórralos antes de eliminar el equipo." };
    }

    await prisma.membership.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    revalidatePath("/admin/equipos");
    revalidatePath("/admin");
    return {};
  } catch (err) {
    console.error("Error al eliminar el equipo:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido eliminar. Inténtalo de nuevo." };
  }
}

