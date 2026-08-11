import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: false, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

const messageUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { message: { updateMany: (...args: unknown[]) => messageUpdateMany(...args) } },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "OWNER" });
  messageUpdateMany.mockReset();
  messageUpdateMany.mockResolvedValue({ count: 1 });
  revalidatePath.mockReset();
});

describe("postponeMessage", () => {
  it("guarda la nueva fecha límite, filtrando por workspace activo", async () => {
    const { postponeMessage } = await import("../src/app/(dashboard)/actions");
    const fecha = new Date("2026-08-15T00:00:00.000Z");
    await postponeMessage("m1", fecha);
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { fechaLimite: fecha },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
  });

  it("quita la fecha límite con null", async () => {
    const { postponeMessage } = await import("../src/app/(dashboard)/actions");
    await postponeMessage("m1", null);
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { fechaLimite: null },
    });
  });

  it("rechaza con rol VIEWER, sin tocar la BD", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { postponeMessage } = await import("../src/app/(dashboard)/actions");
    await expect(postponeMessage("m1", new Date())).rejects.toThrow(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });
});
