import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

const messageDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { deleteMany: (...args: unknown[]) => messageDeleteMany(...args) },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

describe("deleteMessage", () => {
  beforeEach(() => {
    messageDeleteMany.mockReset();
    revalidatePath.mockReset();
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
  });

  it("rechaza borrar con rol VIEWER, sin tocar la base de datos", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { deleteMessage } = await import("../src/app/(dashboard)/actions");
    const result = await deleteMessage("m1");
    expect(result.error).toMatch(/solo lectura/);
    expect(messageDeleteMany).not.toHaveBeenCalled();
  });

  it("borra solo si la nota pertenece al usuario de la sesión", async () => {
    messageDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteMessage } = await import("../src/app/(dashboard)/actions");

    const result = await deleteMessage("m1");

    expect(messageDeleteMany).toHaveBeenCalledWith({ where: { id: "m1", workspaceId: "ws1" } });
    expect(result.error).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/notas");
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
  });

  it("devuelve un error si no encuentra la nota (ya borrada o de otro usuario)", async () => {
    messageDeleteMany.mockResolvedValue({ count: 0 });
    const { deleteMessage } = await import("../src/app/(dashboard)/actions");

    const result = await deleteMessage("no-existe");
    expect(result.error).toMatch(/no se ha encontrado/i);
  });

  it("un fallo al borrar se traduce a un mensaje genérico en español", async () => {
    messageDeleteMany.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { deleteMessage } = await import("../src/app/(dashboard)/actions");

    const result = await deleteMessage("m1");
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/ECONNREFUSED|5432/);
  });
});
