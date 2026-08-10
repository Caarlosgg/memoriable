import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireSuperAdmin = vi.fn(async () => "admin1");
vi.mock("@/lib/dal", () => ({ requireSuperAdmin: () => requireSuperAdmin() }));

const createPasswordResetToken = vi.fn();
vi.mock("@/lib/passwordReset", () => ({
  createPasswordResetToken: (...args: unknown[]) => createPasswordResetToken(...args),
}));

const sendPasswordResetEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...args),
  resolveBaseUrl: async () => "http://localhost:3000",
}));

const userCount = vi.fn();
const userFindMany = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userDelete = vi.fn();
const workspaceCount = vi.fn();
const workspaceFindMany = vi.fn();
const workspaceFindUnique = vi.fn();
const workspaceDelete = vi.fn();
const messageCount = vi.fn();
const messageDeleteMany = vi.fn();
const eventoCount = vi.fn();
const eventoDeleteMany = vi.fn();
const membershipFindMany = vi.fn();
const membershipCount = vi.fn();
const membershipDeleteMany = vi.fn();
const assistantExchangeDeleteMany = vi.fn();
const conversationDeleteMany = vi.fn();
const cuentaAhorroDeleteMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      count: (...args: unknown[]) => userCount(...args),
      findMany: (...args: unknown[]) => userFindMany(...args),
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
      delete: (...args: unknown[]) => userDelete(...args),
    },
    workspace: {
      count: (...args: unknown[]) => workspaceCount(...args),
      findMany: (...args: unknown[]) => workspaceFindMany(...args),
      findUnique: (...args: unknown[]) => workspaceFindUnique(...args),
      delete: (...args: unknown[]) => workspaceDelete(...args),
    },
    message: {
      count: (...args: unknown[]) => messageCount(...args),
      deleteMany: (...args: unknown[]) => messageDeleteMany(...args),
    },
    evento: {
      count: (...args: unknown[]) => eventoCount(...args),
      deleteMany: (...args: unknown[]) => eventoDeleteMany(...args),
    },
    membership: {
      findMany: (...args: unknown[]) => membershipFindMany(...args),
      count: (...args: unknown[]) => membershipCount(...args),
      deleteMany: (...args: unknown[]) => membershipDeleteMany(...args),
    },
    assistantExchange: { deleteMany: (...args: unknown[]) => assistantExchangeDeleteMany(...args) },
    conversation: { deleteMany: (...args: unknown[]) => conversationDeleteMany(...args) },
    cuentaAhorro: { deleteMany: (...args: unknown[]) => cuentaAhorroDeleteMany(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

beforeEach(() => {
  requireSuperAdmin.mockReset();
  requireSuperAdmin.mockResolvedValue("admin1");
  userCount.mockReset();
  userFindMany.mockReset();
  userFindUnique.mockReset();
  userUpdate.mockReset();
  userDelete.mockReset();
  workspaceCount.mockReset();
  workspaceFindMany.mockReset();
  workspaceFindUnique.mockReset();
  workspaceDelete.mockReset();
  messageCount.mockReset();
  messageCount.mockResolvedValue(0);
  messageDeleteMany.mockReset();
  eventoCount.mockReset();
  eventoCount.mockResolvedValue(0);
  eventoDeleteMany.mockReset();
  membershipFindMany.mockReset();
  membershipFindMany.mockResolvedValue([]);
  membershipCount.mockReset();
  membershipDeleteMany.mockReset();
  assistantExchangeDeleteMany.mockReset();
  conversationDeleteMany.mockReset();
  cuentaAhorroDeleteMany.mockReset();
  transaction.mockReset();
  transaction.mockResolvedValue(undefined);
  createPasswordResetToken.mockReset();
  createPasswordResetToken.mockResolvedValue("token-abc");
  sendPasswordResetEmail.mockReset();
  sendPasswordResetEmail.mockResolvedValue(true);
});

describe("getAdminStats", () => {
  it("agrega las cifras globales en paralelo", async () => {
    userCount.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    workspaceCount.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    messageCount.mockResolvedValueOnce(40);
    eventoCount.mockResolvedValueOnce(12);
    const { getAdminStats } = await import("../src/app/(dashboard)/admin/actions");
    const result = await getAdminStats();
    expect(result).toEqual({
      totalUsers: 10,
      totalWorkspaces: 5,
      totalTeamWorkspaces: 3,
      totalMessages: 40,
      totalEventos: 12,
      signupsLast7Days: 2,
    });
    expect(requireSuperAdmin).toHaveBeenCalled();
  });
});

describe("listAdminUsers", () => {
  it("mapea cada usuario, marcando isSelf para quien pregunta", async () => {
    userFindMany.mockResolvedValue([
      {
        id: "admin1",
        email: "admin@example.com",
        emailVerified: true,
        accountPending: false,
        isSuperAdmin: true,
        passwordHash: "hash",
        telegramChatId: null,
        createdAt: new Date("2026-01-01"),
        _count: { memberships: 1 },
      },
      {
        id: "u2",
        email: "otra@example.com",
        emailVerified: false,
        accountPending: true,
        isSuperAdmin: false,
        passwordHash: null,
        telegramChatId: BigInt(123),
        createdAt: new Date("2026-02-01"),
        _count: { memberships: 2 },
      },
    ]);
    const { listAdminUsers } = await import("../src/app/(dashboard)/admin/actions");
    const result = await listAdminUsers();
    expect(result).toEqual([
      {
        id: "admin1",
        email: "admin@example.com",
        emailVerified: true,
        accountPending: false,
        isSuperAdmin: true,
        hasPassword: true,
        telegramLinked: false,
        membershipCount: 1,
        isSelf: true,
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "u2",
        email: "otra@example.com",
        emailVerified: false,
        accountPending: true,
        isSuperAdmin: false,
        hasPassword: false,
        telegramLinked: true,
        membershipCount: 2,
        isSelf: false,
        createdAt: new Date("2026-02-01"),
      },
    ]);
  });

  it("filtra por email cuando se pasa una consulta", async () => {
    userFindMany.mockResolvedValue([]);
    const { listAdminUsers } = await import("../src/app/(dashboard)/admin/actions");
    await listAdminUsers("ana");
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { contains: "ana", mode: "insensitive" } } }),
    );
  });
});

describe("adminResetUserPassword", () => {
  it("devuelve error si el usuario no existe", async () => {
    userFindUnique.mockResolvedValue(null);
    const { adminResetUserPassword } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminResetUserPassword("u-ajeno");
    expect(result.error).toMatch(/No se ha encontrado/);
    expect(createPasswordResetToken).not.toHaveBeenCalled();
  });

  it("crea el token y manda el correo, sin exponer el token", async () => {
    userFindUnique.mockResolvedValue({ email: "persona@example.com" });
    const { adminResetUserPassword } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminResetUserPassword("u2");
    expect(result.error).toBeUndefined();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      "persona@example.com",
      "http://localhost:3000/restablecer-password?token=token-abc",
    );
  });

  it("devuelve error si el envío del correo falla", async () => {
    userFindUnique.mockResolvedValue({ email: "persona@example.com" });
    sendPasswordResetEmail.mockResolvedValue(false);
    const { adminResetUserPassword } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminResetUserPassword("u2");
    expect(result.error).toMatch(/No se ha podido enviar/);
  });
});

describe("adminSetEmailVerified", () => {
  it("actualiza el campo emailVerified", async () => {
    const { adminSetEmailVerified } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminSetEmailVerified("u2", true);
    expect(result.error).toBeUndefined();
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u2" }, data: { emailVerified: true } });
  });
});

describe("adminSetSuperAdmin", () => {
  it("rechaza cambiarse el permiso a uno mismo", async () => {
    const { adminSetSuperAdmin } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminSetSuperAdmin("admin1", false);
    expect(result.error).toMatch(/a ti mismo/);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("concede el permiso a otra persona", async () => {
    const { adminSetSuperAdmin } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminSetSuperAdmin("u2", true);
    expect(result.error).toBeUndefined();
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u2" }, data: { isSuperAdmin: true } });
  });
});

describe("adminDeleteUser", () => {
  it("rechaza eliminarse a uno mismo", async () => {
    const { adminDeleteUser } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteUser("admin1");
    expect(result.error).toMatch(/propia cuenta/);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("devuelve error si el usuario no existe", async () => {
    userFindUnique.mockResolvedValue(null);
    const { adminDeleteUser } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteUser("u-ajeno");
    expect(result.error).toMatch(/No se ha encontrado/);
  });

  it("rechaza si es la única persona propietaria de un equipo", async () => {
    userFindUnique.mockResolvedValue({ personalWorkspaceId: "ws-personal" });
    membershipFindMany.mockResolvedValue([{ workspaceId: "ws-equipo", workspace: { nombre: "Marketing" } }]);
    membershipCount.mockResolvedValue(0);
    const { adminDeleteUser } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteUser("u2");
    expect(result.error).toMatch(/única persona propietaria del equipo "Marketing"/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("no rechaza si hay otro propietario activo en ese equipo", async () => {
    userFindUnique.mockResolvedValue({ personalWorkspaceId: "ws-personal" });
    membershipFindMany.mockResolvedValue([{ workspaceId: "ws-equipo", workspace: { nombre: "Marketing" } }]);
    membershipCount.mockResolvedValue(1);
    const { adminDeleteUser } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteUser("u2");
    expect(result.error).toBeUndefined();
  });

  it("rechaza si tiene notas o eventos en un equipo compartido", async () => {
    userFindUnique.mockResolvedValue({ personalWorkspaceId: "ws-personal" });
    messageCount.mockResolvedValue(2);
    const { adminDeleteUser } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteUser("u2");
    expect(result.error).toMatch(/contenido compartido|equipo compartido/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("borra en transacción el contenido personal, el usuario y su workspace personal", async () => {
    userFindUnique.mockResolvedValue({ personalWorkspaceId: "ws-personal" });
    const { adminDeleteUser } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteUser("u2");
    expect(result.error).toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(assistantExchangeDeleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(conversationDeleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(cuentaAhorroDeleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(messageDeleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(eventoDeleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "u2" } });
    expect(workspaceDelete).toHaveBeenCalledWith({ where: { id: "ws-personal" } });
  });
});

describe("adminDeleteWorkspace", () => {
  it("devuelve error si el workspace no existe", async () => {
    workspaceFindUnique.mockResolvedValue(null);
    const { adminDeleteWorkspace } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteWorkspace("ws-ajeno");
    expect(result.error).toMatch(/No se ha encontrado/);
  });

  it("rechaza eliminar un espacio personal desde aquí", async () => {
    workspaceFindUnique.mockResolvedValue({ personal: true });
    const { adminDeleteWorkspace } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteWorkspace("ws-personal");
    expect(result.error).toMatch(/espacio personal/);
  });

  it("rechaza si el equipo todavía tiene notas o eventos", async () => {
    workspaceFindUnique.mockResolvedValue({ personal: false });
    messageCount.mockResolvedValue(3);
    const { adminDeleteWorkspace } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteWorkspace("ws1");
    expect(result.error).toMatch(/todavía tiene notas o eventos/);
    expect(workspaceDelete).not.toHaveBeenCalled();
  });

  it("elimina las membresías y el workspace si está vacío", async () => {
    workspaceFindUnique.mockResolvedValue({ personal: false });
    const { adminDeleteWorkspace } = await import("../src/app/(dashboard)/admin/actions");
    const result = await adminDeleteWorkspace("ws1");
    expect(result.error).toBeUndefined();
    expect(membershipDeleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1" } });
    expect(workspaceDelete).toHaveBeenCalledWith({ where: { id: "ws1" } });
  });
});
