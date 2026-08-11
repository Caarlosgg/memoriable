import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

const messageUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { updateMany: (...args: unknown[]) => messageUpdateMany(...args) },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

describe("moveTask", () => {
  beforeEach(() => {
    messageUpdateMany.mockReset();
    messageUpdateMany.mockResolvedValue({ count: 1 });
    revalidatePath.mockReset();
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
  });

  it("rechaza mover una tarjeta con rol VIEWER, sin tocar la base de datos", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { moveTask } = await import("../src/app/(dashboard)/actions");
    await expect(moveTask("m1", "EN_PROGRESO", 1234.5)).rejects.toThrow(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("guarda la columna y el orden nuevos, ligados al usuario de la sesión", async () => {
    const { moveTask } = await import("../src/app/(dashboard)/actions");

    await moveTask("m1", "EN_PROGRESO", 1234.5);

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { estado: "EN_PROGRESO", hecho: false, orden: 1234.5 },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
  });

  it("marca hecho:true cuando la columna destino es HECHO", async () => {
    const { moveTask } = await import("../src/app/(dashboard)/actions");

    await moveTask("m1", "HECHO", 500);

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { estado: "HECHO", hecho: true, orden: 500 },
    });
  });
});
