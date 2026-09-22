import { describe, expect, it, vi, beforeEach } from "vitest";

// Sin test de la ruta de éxito/error hasta ahora — solo el guardado de rol
// VIEWER (ver viewerWriteGuards.test.ts).
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }));
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

describe("updateTaskPriority", () => {
  beforeEach(() => {
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
    messageUpdateMany.mockReset();
    messageUpdateMany.mockResolvedValue({ count: 1 });
    revalidatePath.mockReset();
    captureException.mockReset();
  });

  it("guarda la prioridad nueva, filtrando por workspace activo", async () => {
    const { updateTaskPriority } = await import("../src/app/(dashboard)/actions");
    await updateTaskPriority("m1", "ALTA");
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { prioridad: "ALTA" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
  });

  it("un fallo de base de datos se reporta a Sentry antes de relanzar", async () => {
    messageUpdateMany.mockRejectedValue(new Error("conexión perdida"));
    const { updateTaskPriority } = await import("../src/app/(dashboard)/actions");
    await expect(updateTaskPriority("m1", "ALTA")).rejects.toThrow("conexión perdida");
    expect(captureException).toHaveBeenCalledOnce();
  });
});
