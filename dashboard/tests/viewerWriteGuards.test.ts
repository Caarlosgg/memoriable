import { describe, expect, it, vi, beforeEach } from "vitest";

// Cubre el guardado de rol VIEWER en las funciones de (dashboard)/actions.ts
// que, a diferencia de moveTask/deleteMessage/assignMessage/uploadImage/
// saveCampoTemplate (ver sus propios archivos de test), no tenían ningún
// test dedicado todavía — updateTaskStatus/updateTaskPriority ni siquiera
// devuelven `{error}` (son `Promise<void>`), así que aquí se comprueba que
// LANZAN en vez de escribir en la base de datos.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: false, role: "MEMBER" }));
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

const captureMessage = vi.fn();
vi.mock("@/lib/pipeline", () => ({ captureMessage: (...args: unknown[]) => captureMessage(...args) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
  messageUpdateMany.mockReset();
  captureMessage.mockReset();
});

describe("rol VIEWER — funciones de escritura sin test dedicado propio", () => {
  it("updateTaskStatus lanza con rol VIEWER, sin tocar la base de datos", async () => {
    const { updateTaskStatus } = await import("../src/app/(dashboard)/actions");
    await expect(updateTaskStatus("m1", "EN_PROGRESO")).rejects.toThrow(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("updateTaskPriority lanza con rol VIEWER, sin tocar la base de datos", async () => {
    const { updateTaskPriority } = await import("../src/app/(dashboard)/actions");
    await expect(updateTaskPriority("m1", "ALTA")).rejects.toThrow(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("updateMessage rechaza con rol VIEWER, sin tocar la base de datos", async () => {
    const { updateMessage } = await import("../src/app/(dashboard)/actions");
    const result = await updateMessage("m1", { resumen: "nuevo" });
    expect(result.error).toMatch(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("capture rechaza con rol VIEWER, sin llamar al pipeline de captura", async () => {
    const { capture } = await import("../src/app/(dashboard)/actions");
    const formData = new FormData();
    formData.set("contenido", "algo");
    const result = await capture({}, formData);
    expect(result.error).toMatch(/solo lectura/);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
