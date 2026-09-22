import { describe, expect, it, vi, beforeEach } from "vitest";

// Sin test dedicado hasta ahora (ver viewerWriteGuards.test.ts, que solo
// cubre el guardado de rol VIEWER) — se añade aquí al conectar
// spawnSiguienteOcurrencia, para no dejar la ruta de éxito sin cubrir.
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
const messageFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      updateMany: (...args: unknown[]) => messageUpdateMany(...args),
      findUnique: (...args: unknown[]) => messageFindUnique(...args),
    },
  },
}));

const logActivity = vi.fn();
vi.mock("@/lib/activityLog", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const spawnSiguienteOcurrencia = vi.fn();
vi.mock("@/lib/recurringTasks", () => ({ spawnSiguienteOcurrencia: (...a: unknown[]) => spawnSiguienteOcurrencia(...a) }));

describe("updateTaskStatus", () => {
  beforeEach(() => {
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
    messageUpdateMany.mockReset();
    messageUpdateMany.mockResolvedValue({ count: 1 });
    messageFindUnique.mockReset();
    messageFindUnique.mockResolvedValue({ resumen: "Sacar la basura" });
    logActivity.mockReset();
    revalidatePath.mockReset();
    spawnSiguienteOcurrencia.mockReset();
    captureException.mockReset();
  });

  it("cambia el estado y avisa si hay que generar la siguiente ocurrencia de una serie recurrente", async () => {
    const { updateTaskStatus } = await import("../src/app/(dashboard)/actions");
    await updateTaskStatus("m1", "HECHO");
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { estado: "HECHO", hecho: true, enProgresoPorId: null, enProgresoDesde: null },
    });
    expect(spawnSiguienteOcurrencia).toHaveBeenCalledWith("m1");
  });

  it("un estado que no es HECHO no comprueba la recurrencia", async () => {
    const { updateTaskStatus } = await import("../src/app/(dashboard)/actions");
    await updateTaskStatus("m1", "EN_PROGRESO");
    expect(spawnSiguienteOcurrencia).not.toHaveBeenCalled();
  });

  it("si la tarjeta ya no estaba en este workspace (count 0), no comprueba la recurrencia", async () => {
    messageUpdateMany.mockResolvedValue({ count: 0 });
    const { updateTaskStatus } = await import("../src/app/(dashboard)/actions");
    await updateTaskStatus("m1", "HECHO");
    expect(spawnSiguienteOcurrencia).not.toHaveBeenCalled();
  });

  it("un fallo de base de datos se reporta a Sentry antes de relanzar (antes era invisible en producción)", async () => {
    messageUpdateMany.mockRejectedValue(new Error("conexión perdida"));
    const { updateTaskStatus } = await import("../src/app/(dashboard)/actions");

    await expect(updateTaskStatus("m1", "HECHO")).rejects.toThrow("conexión perdida");
    expect(captureException).toHaveBeenCalledOnce();
  });
});
