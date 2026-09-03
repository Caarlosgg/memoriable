import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const setActiveWorkspaceCookie = vi.fn();
const createPersonalWorkspace = vi.fn();
vi.mock("@/lib/workspace", () => ({
  setActiveWorkspaceCookie: (...args: unknown[]) => setActiveWorkspaceCookie(...args),
  createPersonalWorkspace: (...args: unknown[]) => createPersonalWorkspace(...args),
  // Import dinámico (no en el ámbito del módulo): así resuelve al `@/lib/prisma`
  // ya mockeado más abajo, sin depender del orden de estos dos `vi.mock`.
  listWorkspaceMembers: async (workspaceId: string, currentUserId: string) => {
    const { prisma } = await import("@/lib/prisma");
    const memberships = await prisma.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { email: true, accountPending: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((m: { userId: string; role: string; status: string; user: { email: string; accountPending: boolean } }) => ({
      userId: m.userId,
      email: m.user.email,
      role: m.role,
      status: m.status,
      isSelf: m.userId === currentUserId,
      accountPending: m.user.accountPending,
    }));
  },
}));

const createNotification = vi.fn();
const logActivity = vi.fn();
vi.mock("@/lib/activityLog", () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

const createPasswordResetToken = vi.fn();
vi.mock("@/lib/passwordReset", () => ({
  createPasswordResetToken: (...args: unknown[]) => createPasswordResetToken(...args),
}));

const sendAccountSetupEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendAccountSetupEmail: (...args: unknown[]) => sendAccountSetupEmail(...args),
  resolveBaseUrl: async () => "http://localhost:3000",
}));

const membershipFindMany = vi.fn();
const membershipFindUnique = vi.fn();
const membershipCreate = vi.fn();
const membershipUpdateMany = vi.fn();
const membershipDeleteMany = vi.fn();
const membershipCount = vi.fn();
const membershipDelete = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const workspaceCreate = vi.fn();
const workspaceFindUnique = vi.fn();
const workspaceUpdate = vi.fn();
const messageUpdateMany = vi.fn();
const eventoUpdateMany = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findMany: (...args: unknown[]) => membershipFindMany(...args),
      findUnique: (...args: unknown[]) => membershipFindUnique(...args),
      create: (...args: unknown[]) => membershipCreate(...args),
      updateMany: (...args: unknown[]) => membershipUpdateMany(...args),
      deleteMany: (...args: unknown[]) => membershipDeleteMany(...args),
      count: (...args: unknown[]) => membershipCount(...args),
      delete: (...args: unknown[]) => membershipDelete(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
    workspace: {
      create: (...args: unknown[]) => workspaceCreate(...args),
      findUnique: (...args: unknown[]) => workspaceFindUnique(...args),
      update: (...args: unknown[]) => workspaceUpdate(...args),
    },
    message: { updateMany: (...args: unknown[]) => messageUpdateMany(...args) },
    evento: { updateMany: (...args: unknown[]) => eventoUpdateMany(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

beforeEach(() => {
  logActivity.mockReset();
  logActivity.mockResolvedValue(undefined);
  revalidatePath.mockReset();
  setActiveWorkspaceCookie.mockReset();
  createPersonalWorkspace.mockReset();
  createPersonalWorkspace.mockResolvedValue("ws-personal-nuevo");
  createNotification.mockReset();
  createNotification.mockResolvedValue(undefined);
  createPasswordResetToken.mockReset();
  createPasswordResetToken.mockResolvedValue("token-123");
  sendAccountSetupEmail.mockReset();
  sendAccountSetupEmail.mockResolvedValue(true);
  membershipFindMany.mockReset();
  membershipFindUnique.mockReset();
  membershipCreate.mockReset();
  membershipUpdateMany.mockReset();
  membershipDeleteMany.mockReset();
  membershipCount.mockReset();
  membershipDelete.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
  workspaceCreate.mockReset();
  workspaceFindUnique.mockReset();
  workspaceFindUnique.mockResolvedValue({ nombre: "Equipo de prueba" });
  workspaceUpdate.mockReset();
  messageUpdateMany.mockReset();
  eventoUpdateMany.mockReset();
  transaction.mockReset();
});

describe("listMyWorkspaces", () => {
  it("devuelve los workspaces del usuario con su rol y estado", async () => {
    membershipFindMany.mockResolvedValue([
      { workspaceId: "ws-personal", role: "OWNER", status: "ACTIVE", workspace: { nombre: "Personal", personal: true } },
      { workspaceId: "ws-equipo", role: "MEMBER", status: "PENDING", workspace: { nombre: "Marketing", personal: false } },
    ]);
    const { listMyWorkspaces } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await listMyWorkspaces();
    expect(result).toEqual([
      { id: "ws-personal", nombre: "Personal", personal: true, role: "OWNER", status: "ACTIVE" },
      { id: "ws-equipo", nombre: "Marketing", personal: false, role: "MEMBER", status: "PENDING" },
    ]);
  });
});

describe("createWorkspace", () => {
  beforeEach(() => {
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        workspace: { create: (...args: unknown[]) => workspaceCreate(...args) },
        membership: { create: (...args: unknown[]) => membershipCreate(...args) },
      }),
    );
    workspaceCreate.mockResolvedValue({ id: "ws-nuevo" });
  });

  it("rechaza un nombre vacío sin tocar la base de datos", async () => {
    const { createWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await createWorkspace("   ");
    expect(result.error).toMatch(/nombre/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("crea el workspace y la membership OWNER/ACTIVE de quien lo crea", async () => {
    const { createWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await createWorkspace("Marketing");
    expect(result.workspaceId).toBe("ws-nuevo");
    expect(workspaceCreate).toHaveBeenCalledWith({ data: { nombre: "Marketing", personal: false } });
    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "u1", workspaceId: "ws-nuevo", role: "OWNER", status: "ACTIVE" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/equipo");
  });
});

describe("renameWorkspace", () => {
  it("rechaza un nombre vacío", async () => {
    const { renameWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await renameWorkspace("ws1", "   ");
    expect(result.error).toMatch(/nombre/);
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza un nombre demasiado largo", async () => {
    const { renameWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await renameWorkspace("ws1", "a".repeat(61));
    expect(result.error).toMatch(/no puede tener más de 60/);
  });

  it("rechaza si quien pide no es OWNER/ADMIN activo", async () => {
    membershipFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
    const { renameWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await renameWorkspace("ws1", "Nuevo nombre");
    expect(result.error).toMatch(/permiso/);
    expect(workspaceFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza renombrar un espacio personal", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    workspaceFindUnique.mockResolvedValue({ personal: true });
    const { renameWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await renameWorkspace("ws-personal", "Nuevo nombre");
    expect(result.error).toMatch(/No se ha encontrado/);
  });

  it("renombra el equipo si quien pide es OWNER/ADMIN", async () => {
    membershipFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    workspaceFindUnique.mockResolvedValue({ personal: false });
    const { renameWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await renameWorkspace("ws1", "  Marketing Global  ");
    expect(result.error).toBeUndefined();
    expect(workspaceCreate).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/equipo");
  });
});

describe("addMemberByEmail", () => {
  it("rechaza si quien pide no es OWNER/ADMIN activo del workspace", async () => {
    membershipFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "nuevo@example.com");
    expect(result.error).toMatch(/permiso/);
    expect(workspaceFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza si quien pide tiene su propia membership PENDING (no ACTIVE)", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "PENDING" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "nuevo@example.com");
    expect(result.error).toMatch(/permiso/);
  });

  it("rechaza un rol no asignable", async () => {
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "nuevo@example.com", "OWNER");
    expect(result.error).toMatch(/rol/);
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza si ya es miembro activo", async () => {
    membershipFindUnique
      .mockResolvedValueOnce({ role: "OWNER", status: "ACTIVE" })
      .mockResolvedValueOnce({ status: "ACTIVE" });
    userFindUnique.mockResolvedValue({ id: "u2", email: "ya@example.com" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "ya@example.com");
    expect(result.error).toMatch(/Ya es miembro/);
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it("rechaza si ya tiene una invitación pendiente", async () => {
    membershipFindUnique
      .mockResolvedValueOnce({ role: "OWNER", status: "ACTIVE" })
      .mockResolvedValueOnce({ status: "PENDING" });
    userFindUnique.mockResolvedValue({ id: "u2", email: "pendiente@example.com" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "pendiente@example.com");
    expect(result.error).toMatch(/Ya está invitado/);
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it("crea la membership PENDING con el rol elegido si la persona ya tiene cuenta", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: "ADMIN", status: "ACTIVE" }).mockResolvedValueOnce(null);
    userFindUnique.mockResolvedValue({ id: "u2", email: "nuevo@example.com" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "Nuevo@Example.com", "ADMIN");
    expect(result.sent).toBe(true);
    expect(result.accountCreated).toBeUndefined();
    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "u2", workspaceId: "ws1", role: "ADMIN", status: "PENDING" },
    });
    await vi.waitFor(() => expect(createNotification).toHaveBeenCalled());
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u2", type: "ADDED_TO_TEAM" }),
    );
    expect(sendAccountSetupEmail).not.toHaveBeenCalled();
  });

  it("permite invitar con rol VIEWER (solo lectura)", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: "OWNER", status: "ACTIVE" }).mockResolvedValueOnce(null);
    userFindUnique.mockResolvedValue({ id: "u2", email: "cliente@example.com" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "cliente@example.com", "VIEWER");
    expect(result.sent).toBe(true);
    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "u2", workspaceId: "ws1", role: "VIEWER", status: "PENDING" },
    });
  });

  it("crea una cuenta corporativa nueva (workspace personal + membership ACTIVE) si el email no tiene cuenta", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: "OWNER", status: "ACTIVE" });
    userFindUnique.mockResolvedValue(null);
    const txMembershipCreate = vi.fn();
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: (...args: unknown[]) => userCreate(...args) },
        membership: { create: (...args: unknown[]) => txMembershipCreate(...args) },
      }),
    );
    userCreate.mockResolvedValue({ id: "u-nuevo" });

    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "sinCuenta@example.com", "MEMBER");

    expect(result.sent).toBe(true);
    expect(result.accountCreated).toBe(true);
    expect(userCreate).toHaveBeenCalledWith({
      data: { email: "sincuenta@example.com", emailVerified: true, accountPending: true },
    });
    expect(createPersonalWorkspace).toHaveBeenCalledWith(expect.anything(), "u-nuevo");
    expect(txMembershipCreate).toHaveBeenCalledWith({
      data: { userId: "u-nuevo", workspaceId: "ws1", role: "MEMBER", status: "ACTIVE" },
    });
    expect(createPasswordResetToken).toHaveBeenCalledWith("u-nuevo");
    expect(sendAccountSetupEmail).toHaveBeenCalledWith(
      "sincuenta@example.com",
      "http://localhost:3000/restablecer-password?token=token-123",
      "Equipo de prueba",
    );
    await vi.waitFor(() => expect(createNotification).toHaveBeenCalled());
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-nuevo", type: "ADDED_TO_TEAM" }),
    );
  });

  it("no falla la creación de la cuenta corporativa si el envío del email de activación falla", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: "OWNER", status: "ACTIVE" });
    userFindUnique.mockResolvedValue(null);
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: (...args: unknown[]) => userCreate(...args) },
        membership: { create: (...args: unknown[]) => membershipCreate(...args) },
      }),
    );
    userCreate.mockResolvedValue({ id: "u-nuevo" });
    sendAccountSetupEmail.mockRejectedValue(new Error("SMTP caído"));

    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "sinCuenta@example.com");
    expect(result.sent).toBe(true);
    expect(result.accountCreated).toBe(true);
  });
});

describe("changeRole", () => {
  it("rechaza cambiarse el rol a uno mismo", async () => {
    const { changeRole } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await changeRole("ws1", "u1", "ADMIN");
    expect(result.error).toMatch(/cambiarte el rol/);
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza un rol no asignable (p.ej. OWNER)", async () => {
    const { changeRole } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await changeRole("ws1", "u2", "OWNER");
    expect(result.error).toMatch(/rol/);
  });

  it("rechaza si quien pide no es OWNER/ADMIN activo", async () => {
    membershipFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
    const { changeRole } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await changeRole("ws1", "u2", "ADMIN");
    expect(result.error).toMatch(/permiso/);
    expect(membershipUpdateMany).not.toHaveBeenCalled();
  });

  it("devuelve error si no se encuentra a la persona en el equipo (o es OWNER)", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    membershipUpdateMany.mockResolvedValue({ count: 0 });
    const { changeRole } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await changeRole("ws1", "u2", "ADMIN");
    expect(result.error).toMatch(/No se ha encontrado/);
  });

  it("cambia el rol y notifica a la persona afectada", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    membershipUpdateMany.mockResolvedValue({ count: 1 });
    const { changeRole } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await changeRole("ws1", "u2", "ADMIN");
    expect(result.error).toBeUndefined();
    expect(membershipUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u2", workspaceId: "ws1", status: "ACTIVE", role: { not: "OWNER" } },
      data: { role: "ADMIN" },
    });
    await vi.waitFor(() => expect(createNotification).toHaveBeenCalled());
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u2", type: "ROLE_CHANGED" }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/equipo");
  });

  it("permite cambiar a rol VIEWER, con notificación que menciona el acceso de solo lectura", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    membershipUpdateMany.mockResolvedValue({ count: 1 });
    const { changeRole } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await changeRole("ws1", "u2", "VIEWER");
    expect(result.error).toBeUndefined();
    expect(membershipUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u2", workspaceId: "ws1", status: "ACTIVE", role: { not: "OWNER" } },
      data: { role: "VIEWER" },
    });
    await vi.waitFor(() => expect(createNotification).toHaveBeenCalled());
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u2", type: "ROLE_CHANGED", body: expect.stringMatching(/solo lectura/) }),
    );
  });
});

describe("removeMember", () => {
  it("rechaza quitarse a uno mismo", async () => {
    const { removeMember } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await removeMember("ws1", "u1");
    expect(result.error).toMatch(/quitarte a ti mismo/);
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza si quien pide no es OWNER/ADMIN activo", async () => {
    membershipFindUnique.mockImplementation(async ({ where }: { where: { userId_workspaceId: { userId: string } } }) =>
      where.userId_workspaceId.userId === "u1" ? { role: "MEMBER", status: "ACTIVE" } : { role: "MEMBER", status: "ACTIVE" },
    );
    const { removeMember } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await removeMember("ws1", "u2");
    expect(result.error).toMatch(/permiso/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("devuelve error si la persona no está en el equipo", async () => {
    membershipFindUnique.mockImplementation(async ({ where }: { where: { userId_workspaceId: { userId: string } } }) =>
      where.userId_workspaceId.userId === "u1" ? { role: "OWNER", status: "ACTIVE" } : null,
    );
    const { removeMember } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await removeMember("ws1", "u2");
    expect(result.error).toMatch(/no está en el equipo/);
  });

  it("rechaza quitar al único OWNER activo", async () => {
    membershipFindUnique.mockImplementation(async ({ where }: { where: { userId_workspaceId: { userId: string } } }) =>
      where.userId_workspaceId.userId === "u1"
        ? { role: "OWNER", status: "ACTIVE" }
        : { role: "OWNER", status: "ACTIVE" },
    );
    membershipCount.mockResolvedValue(0);
    const { removeMember } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await removeMember("ws1", "u2");
    expect(result.error).toMatch(/único propietario/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("quita a la persona y libera sus tareas/eventos asignados", async () => {
    membershipFindUnique.mockImplementation(async ({ where }: { where: { userId_workspaceId: { userId: string } } }) =>
      where.userId_workspaceId.userId === "u1"
        ? { role: "OWNER", status: "ACTIVE" }
        : { role: "MEMBER", status: "ACTIVE" },
    );
    transaction.mockResolvedValue(undefined);
    const { removeMember } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await removeMember("ws1", "u2");
    expect(result.error).toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(membershipDelete).toHaveBeenCalledWith({ where: { userId_workspaceId: { userId: "u2", workspaceId: "ws1" } } });
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", assigneeId: "u2" },
      data: { assigneeId: null },
    });
    expect(eventoUpdateMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", assigneeId: "u2" },
      data: { assigneeId: null },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/equipo");
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });
});

describe("leaveWorkspace", () => {
  it("devuelve error si no pertenece (o ya no está activo) en ese workspace", async () => {
    membershipFindUnique.mockResolvedValue(null);
    const { leaveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await leaveWorkspace("ws-ajeno");
    expect(result.error).toMatch(/No perteneces/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rechaza salir del espacio personal", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE", workspace: { personal: true } });
    const { leaveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await leaveWorkspace("ws-personal");
    expect(result.error).toMatch(/espacio personal/);
  });

  it("rechaza salir si es el único OWNER activo del equipo", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE", workspace: { personal: false } });
    membershipCount.mockResolvedValue(0);
    const { leaveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await leaveWorkspace("ws1");
    expect(result.error).toMatch(/único propietario/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("permite salir si hay otro OWNER activo", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE", workspace: { personal: false } });
    membershipCount.mockResolvedValue(1);
    const { leaveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await leaveWorkspace("ws1");
    expect(result.error).toBeUndefined();
  });

  it("un MEMBER normal puede salir sin comprobar propiedad", async () => {
    membershipFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE", workspace: { personal: false } });
    const { leaveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await leaveWorkspace("ws1");
    expect(result.error).toBeUndefined();
    expect(membershipCount).not.toHaveBeenCalled();
  });

  it("borra la membership propia y libera sus asignaciones", async () => {
    membershipFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE", workspace: { personal: false } });
    transaction.mockResolvedValue(undefined);
    const { leaveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await leaveWorkspace("ws1");
    expect(result.error).toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(membershipDelete).toHaveBeenCalledWith({ where: { userId_workspaceId: { userId: "u1", workspaceId: "ws1" } } });
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", assigneeId: "u1" },
      data: { assigneeId: null },
    });
    expect(eventoUpdateMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", assigneeId: "u1" },
      data: { assigneeId: null },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("acceptMembership / declineMembership", () => {
  it("acceptMembership pasa la propia membership PENDING a ACTIVE", async () => {
    membershipUpdateMany.mockResolvedValue({ count: 1 });
    const { acceptMembership } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await acceptMembership("ws1");
    expect(result.error).toBeUndefined();
    expect(membershipUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", workspaceId: "ws1", status: "PENDING" },
      data: { status: "ACTIVE" },
    });
  });

  it("acceptMembership devuelve error si no hay invitación pendiente que aceptar", async () => {
    membershipUpdateMany.mockResolvedValue({ count: 0 });
    const { acceptMembership } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await acceptMembership("ws1");
    expect(result.error).toMatch(/No se ha encontrado/);
  });

  it("declineMembership borra la propia membership PENDING", async () => {
    membershipDeleteMany.mockResolvedValue({ count: 1 });
    const { declineMembership } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await declineMembership("ws1");
    expect(result.error).toBeUndefined();
    expect(membershipDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1", workspaceId: "ws1", status: "PENDING" } });
  });
});

describe("setActiveWorkspace", () => {
  it("cambia la cookie si el usuario es miembro válido", async () => {
    setActiveWorkspaceCookie.mockResolvedValue(true);
    const { setActiveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await setActiveWorkspace("ws1");
    expect(result.error).toBeUndefined();
    expect(setActiveWorkspaceCookie).toHaveBeenCalledWith("u1", "ws1");
  });

  it("devuelve error si no pertenece a ese workspace", async () => {
    setActiveWorkspaceCookie.mockResolvedValue(false);
    const { setActiveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await setActiveWorkspace("ws-ajeno");
    expect(result.error).toMatch(/No perteneces/);
  });
});

describe("getWorkspaceMembers", () => {
  it("lanza si quien pregunta no pertenece al workspace", async () => {
    membershipFindUnique.mockResolvedValue(null);
    const { getWorkspaceMembers } = await import("../src/app/(dashboard)/equipo/actions");
    await expect(getWorkspaceMembers("ws-ajeno")).rejects.toThrow(/No perteneces/);
  });

  it("devuelve la lista de miembros marcando isSelf y accountPending", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    membershipFindMany.mockResolvedValue([
      { userId: "u1", role: "OWNER", status: "ACTIVE", user: { email: "yo@example.com", accountPending: false } },
      { userId: "u2", role: "MEMBER", status: "ACTIVE", user: { email: "compi@example.com", accountPending: true } },
    ]);
    const { getWorkspaceMembers } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await getWorkspaceMembers("ws1");
    expect(result).toEqual([
      { userId: "u1", email: "yo@example.com", role: "OWNER", status: "ACTIVE", isSelf: true, accountPending: false },
      { userId: "u2", email: "compi@example.com", role: "MEMBER", status: "ACTIVE", isSelf: false, accountPending: true },
    ]);
  });
});

/**
 * Auditoría de las tres acciones que NO dejaban rastro. Echar a alguien es
 * la acción más sensible del producto, y era justo la única sin registrar
 * — invitar, añadir, cambiar de rol y transferir la propiedad sí lo
 * estaban.
 */
describe("registro de actividad de las acciones sensibles", () => {
  it("quitar a alguien del equipo queda registrado, con el rol que tenía", async () => {
    membershipFindUnique
      .mockResolvedValueOnce({ userId: "u1", workspaceId: "ws1", role: "OWNER", status: "ACTIVE" })
      .mockResolvedValueOnce({ userId: "u2", workspaceId: "ws1", role: "MEMBER", status: "ACTIVE" });
    transaction.mockResolvedValue([]);
    const { removeMember } = await import("../src/app/(dashboard)/equipo/actions");

    expect(await removeMember("ws1", "u2")).toEqual({});
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "miembro_expulsado", entidadId: "u2", detalle: { role: "MEMBER" } }),
    );
  });

  it("salirse del equipo también se registra: el resto tiene que saber por qué hay tareas sin asignar", async () => {
    membershipFindUnique.mockResolvedValue({
      role: "MEMBER",
      status: "ACTIVE",
      workspace: { personal: false },
    });
    transaction.mockResolvedValue([]);
    const { leaveWorkspace } = await import("../src/app/(dashboard)/equipo/actions");

    expect(await leaveWorkspace("ws1")).toEqual({});
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ tipo: "miembro_salio" }));
  });

  it("renombrar el equipo guarda el nombre ANTERIOR: sin él la entrada no dice nada", async () => {
    membershipFindUnique.mockResolvedValue({ userId: "u1", workspaceId: "ws1", role: "OWNER", status: "ACTIVE" });
    workspaceFindUnique.mockResolvedValue({ personal: false, nombre: "Antiguo" });
    workspaceUpdate.mockResolvedValue({});
    const { renameWorkspace } = await import("../src/app/(dashboard)/equipo/actions");

    expect(await renameWorkspace("ws1", "Obrador")).toEqual({});
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "equipo_renombrado",
        detalle: { antes: "Antiguo", ahora: "Obrador" },
      }),
    );
  });

  it("un fallo al registrar NO tumba la acción: la auditoría es best-effort", async () => {
    logActivity.mockRejectedValue(new Error("BD caída"));
    membershipFindUnique.mockResolvedValue({ userId: "u1", workspaceId: "ws1", role: "OWNER", status: "ACTIVE" });
    workspaceFindUnique.mockResolvedValue({ personal: false, nombre: "Antiguo" });
    workspaceUpdate.mockResolvedValue({});
    const { renameWorkspace } = await import("../src/app/(dashboard)/equipo/actions");

    expect(await renameWorkspace("ws1", "Obrador")).toEqual({});
  });
});
