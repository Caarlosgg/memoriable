import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const setActiveWorkspaceCookie = vi.fn();
vi.mock("@/lib/workspace", () => ({
  setActiveWorkspaceCookie: (...args: unknown[]) => setActiveWorkspaceCookie(...args),
}));

const membershipFindMany = vi.fn();
const membershipFindUnique = vi.fn();
const membershipCreate = vi.fn();
const membershipUpdateMany = vi.fn();
const membershipDeleteMany = vi.fn();
const userFindUnique = vi.fn();
const workspaceCreate = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findMany: (...args: unknown[]) => membershipFindMany(...args),
      findUnique: (...args: unknown[]) => membershipFindUnique(...args),
      create: (...args: unknown[]) => membershipCreate(...args),
      updateMany: (...args: unknown[]) => membershipUpdateMany(...args),
      deleteMany: (...args: unknown[]) => membershipDeleteMany(...args),
    },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    workspace: { create: (...args: unknown[]) => workspaceCreate(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

beforeEach(() => {
  revalidatePath.mockReset();
  setActiveWorkspaceCookie.mockReset();
  membershipFindMany.mockReset();
  membershipFindUnique.mockReset();
  membershipCreate.mockReset();
  membershipUpdateMany.mockReset();
  membershipDeleteMany.mockReset();
  userFindUnique.mockReset();
  workspaceCreate.mockReset();
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
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza si quien pide tiene su propia membership PENDING (no ACTIVE)", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "PENDING" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "nuevo@example.com");
    expect(result.error).toMatch(/permiso/);
  });

  it("dice que no existe cuenta si el email no está registrado", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: "OWNER", status: "ACTIVE" });
    userFindUnique.mockResolvedValue(null);
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "nadie@example.com");
    expect(result.error).toMatch(/No existe ninguna cuenta/);
    expect(membershipCreate).not.toHaveBeenCalled();
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

  it("crea la membership PENDING si todo es correcto", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: "ADMIN", status: "ACTIVE" }).mockResolvedValueOnce(null);
    userFindUnique.mockResolvedValue({ id: "u2", email: "nuevo@example.com" });
    const { addMemberByEmail } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await addMemberByEmail("ws1", "Nuevo@Example.com");
    expect(result.sent).toBe(true);
    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "u2", workspaceId: "ws1", role: "MEMBER", status: "PENDING" },
    });
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

  it("devuelve la lista de miembros marcando isSelf", async () => {
    membershipFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    membershipFindMany.mockResolvedValue([
      { userId: "u1", role: "OWNER", status: "ACTIVE", user: { email: "yo@example.com" } },
      { userId: "u2", role: "MEMBER", status: "PENDING", user: { email: "compi@example.com" } },
    ]);
    const { getWorkspaceMembers } = await import("../src/app/(dashboard)/equipo/actions");
    const result = await getWorkspaceMembers("ws1");
    expect(result).toEqual([
      { userId: "u1", email: "yo@example.com", role: "OWNER", status: "ACTIVE", isSelf: true },
      { userId: "u2", email: "compi@example.com", role: "MEMBER", status: "PENDING", isSelf: false },
    ]);
  });
});
