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
}));

const createNotification = vi.fn();
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
    },
    message: { updateMany: (...args: unknown[]) => messageUpdateMany(...args) },
    evento: { updateMany: (...args: unknown[]) => eventoUpdateMany(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

beforeEach(() => {
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
