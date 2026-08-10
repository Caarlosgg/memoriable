import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }),
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
