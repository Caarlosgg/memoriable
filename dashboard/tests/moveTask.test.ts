import { describe, expect, it, vi, beforeEach } from "vitest";

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
  prisma: {
    message: { updateMany: (...args: unknown[]) => messageUpdateMany(...args) },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const spawnSiguienteOcurrencia = vi.fn();
vi.mock("@/lib/recurringTasks", () => ({ spawnSiguienteOcurrencia: (...a: unknown[]) => spawnSiguienteOcurrencia(...a) }));

describe("moveTask", () => {
  beforeEach(() => {
    messageUpdateMany.mockReset();
    messageUpdateMany.mockResolvedValue({ count: 1 });
    revalidatePath.mockReset();
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
    spawnSiguienteOcurrencia.mockReset();
    captureException.mockReset();
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
      data: { estado: "HECHO", hecho: true, orden: 500, enProgresoPorId: null, enProgresoDesde: null },
    });
    // Por si es una tarea recurrente — spawnSiguienteOcurrencia decide por
    // sí sola si de verdad hay una serie que continuar (ver su propio test).
    expect(spawnSiguienteOcurrencia).toHaveBeenCalledWith("m1");
  });

  it("NO intenta generar la siguiente ocurrencia si la columna destino no es HECHO", async () => {
    const { moveTask } = await import("../src/app/(dashboard)/actions");
    await moveTask("m1", "EN_PROGRESO", 1234.5);
    expect(spawnSiguienteOcurrencia).not.toHaveBeenCalled();
  });

  it("si la tarjeta ya no estaba en este workspace (count 0), no intenta generar la siguiente", async () => {
    messageUpdateMany.mockResolvedValue({ count: 0 });
    const { moveTask } = await import("../src/app/(dashboard)/actions");
    await moveTask("m1", "HECHO", 500);
    expect(spawnSiguienteOcurrencia).not.toHaveBeenCalled();
  });

  it("un fallo de base de datos se reporta a Sentry antes de relanzar", async () => {
    messageUpdateMany.mockRejectedValue(new Error("conexión perdida"));
    const { moveTask } = await import("../src/app/(dashboard)/actions");

    await expect(moveTask("m1", "EN_PROGRESO", 1234.5)).rejects.toThrow("conexión perdida");
    expect(captureException).toHaveBeenCalledOnce();
  });
});
