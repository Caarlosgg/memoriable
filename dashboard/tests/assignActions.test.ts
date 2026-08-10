import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const isActiveMember = vi.fn();
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: async () => ({ workspaceId: "ws1", isPersonal: false, role: "OWNER" }),
  isActiveMember: (...args: unknown[]) => isActiveMember(...args),
}));

const messageUpdateMany = vi.fn();
const eventoUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { updateMany: (...args: unknown[]) => messageUpdateMany(...args) },
    evento: { updateMany: (...args: unknown[]) => eventoUpdateMany(...args) },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

beforeEach(() => {
  isActiveMember.mockReset();
  messageUpdateMany.mockReset();
  eventoUpdateMany.mockReset();
  revalidatePath.mockReset();
});

describe("assignMessage", () => {
  it("rechaza asignar a alguien que no es miembro activo del workspace", async () => {
    isActiveMember.mockResolvedValue(false);
    const { assignMessage } = await import("../src/app/(dashboard)/actions");
    const result = await assignMessage("m1", "u2");
    expect(result.error).toMatch(/no es miembro/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("asigna la tarea si el destinatario es miembro activo", async () => {
    isActiveMember.mockResolvedValue(true);
    messageUpdateMany.mockResolvedValue({ count: 1 });
    const { assignMessage } = await import("../src/app/(dashboard)/actions");
    const result = await assignMessage("m1", "u2");
    expect(result.error).toBeUndefined();
    expect(messageUpdateMany).toHaveBeenCalledWith({ where: { id: "m1", workspaceId: "ws1" }, data: { assigneeId: "u2" } });
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
  });

  it("quitar la asignación (assigneeId null) no comprueba membership", async () => {
    messageUpdateMany.mockResolvedValue({ count: 1 });
    const { assignMessage } = await import("../src/app/(dashboard)/actions");
    const result = await assignMessage("m1", null);
    expect(result.error).toBeUndefined();
    expect(isActiveMember).not.toHaveBeenCalled();
    expect(messageUpdateMany).toHaveBeenCalledWith({ where: { id: "m1", workspaceId: "ws1" }, data: { assigneeId: null } });
  });

  it("devuelve error si la tarea no pertenece al workspace activo", async () => {
    isActiveMember.mockResolvedValue(true);
    messageUpdateMany.mockResolvedValue({ count: 0 });
    const { assignMessage } = await import("../src/app/(dashboard)/actions");
    const result = await assignMessage("m-ajeno", "u2");
    expect(result.error).toMatch(/No se ha encontrado/);
  });
});

describe("assignEvento", () => {
  it("rechaza asignar a alguien que no es miembro activo del workspace", async () => {
    isActiveMember.mockResolvedValue(false);
    const { assignEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await assignEvento("e1", "u2");
    expect(result.error).toMatch(/no es miembro/);
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("asigna el evento si el destinatario es miembro activo", async () => {
    isActiveMember.mockResolvedValue(true);
    eventoUpdateMany.mockResolvedValue({ count: 1 });
    const { assignEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await assignEvento("e1", "u2");
    expect(result.error).toBeUndefined();
    expect(eventoUpdateMany).toHaveBeenCalledWith({ where: { id: "e1", workspaceId: "ws1" }, data: { assigneeId: "u2" } });
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("devuelve error si el evento no pertenece al workspace activo", async () => {
    isActiveMember.mockResolvedValue(true);
    eventoUpdateMany.mockResolvedValue({ count: 0 });
    const { assignEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await assignEvento("e-ajeno", "u2");
    expect(result.error).toMatch(/No se ha encontrado/);
  });
});
