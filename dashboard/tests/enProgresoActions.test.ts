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
const messageFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      updateMany: (...args: unknown[]) => messageUpdateMany(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
    },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "OWNER" });
  messageUpdateMany.mockReset();
  messageUpdateMany.mockResolvedValue({ count: 1 });
  messageFindMany.mockReset();
  revalidatePath.mockReset();
});

describe("startWorkingOn", () => {
  it("te marca como quien está trabajando en ella ahora, y la mueve a EN_PROGRESO", async () => {
    const { startWorkingOn } = await import("../src/app/(dashboard)/actions");
    await startWorkingOn("m1");
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: expect.objectContaining({ enProgresoPorId: "u1", estado: "EN_PROGRESO" }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
  });

  it("rechaza con rol VIEWER, sin tocar la BD", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { startWorkingOn } = await import("../src/app/(dashboard)/actions");
    await expect(startWorkingOn("m1")).rejects.toThrow(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });
});

describe("stopWorkingOn", () => {
  it("quita quién está trabajando en ella, sin tocar el estado", async () => {
    const { stopWorkingOn } = await import("../src/app/(dashboard)/actions");
    await stopWorkingOn("m1");
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { enProgresoPorId: null, enProgresoDesde: null },
    });
  });

  it("rechaza con rol VIEWER, sin tocar la BD", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { stopWorkingOn } = await import("../src/app/(dashboard)/actions");
    await expect(stopWorkingOn("m1")).rejects.toThrow(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });
});

describe("listEnProgresoAhora", () => {
  it("devuelve las tarjetas en curso del workspace activo, con fechas serializadas", async () => {
    messageFindMany.mockResolvedValue([
      {
        id: "m1",
        resumen: "Llamar al fontanero",
        categoria: "tarea",
        enProgresoPorId: "u2",
        enProgresoDesde: new Date("2026-08-11T10:00:00.000Z"),
      },
    ]);
    const { listEnProgresoAhora } = await import("../src/app/(dashboard)/actions");
    const result = await listEnProgresoAhora();
    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws1", enProgresoPorId: { not: null } } }),
    );
    expect(result).toEqual([
      {
        id: "m1",
        resumen: "Llamar al fontanero",
        categoria: "tarea",
        enProgresoPorId: "u2",
        enProgresoDesde: "2026-08-11T10:00:00.000Z",
      },
    ]);
  });

  it("VIEWER también puede consultarla (es de solo lectura)", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    messageFindMany.mockResolvedValue([]);
    const { listEnProgresoAhora } = await import("../src/app/(dashboard)/actions");
    await expect(listEnProgresoAhora()).resolves.toEqual([]);
  });
});
