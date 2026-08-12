import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: false, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  isActiveMember: vi.fn(),
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

describe("updateMessage", () => {
  it("cambia solo los campos dados, filtrando por workspace activo", async () => {
    const { updateMessage } = await import("../src/app/(dashboard)/actions");
    const result = await updateMessage("m1", { resumen: "Nuevo resumen" });
    expect(result.error).toBeUndefined();
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { resumen: "Nuevo resumen" },
    });
  });

  it("al marcar HECHA, limpia enProgresoPorId/enProgresoDesde", async () => {
    const { updateMessage } = await import("../src/app/(dashboard)/actions");
    await updateMessage("m1", { estado: "HECHO" });
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { estado: "HECHO", hecho: true, enProgresoPorId: null, enProgresoDesde: null },
    });
  });

  it("cambiar SOLO la categoría a una no accionable también limpia 'en curso ahora', aunque el estado no cambie a HECHO", async () => {
    // Bug real encontrado en revisión de código: una tarea EN_PROGRESO con
    // alguien trabajando en ella podía cambiar de categoría a "nota" (deja
    // de ser accionable, desaparece del tablero) sin que nadie limpiara
    // enProgresoPorId — quedaba "en curso" para siempre, sin forma de
    // soltarla desde el tablero.
    const { updateMessage } = await import("../src/app/(dashboard)/actions");
    await updateMessage("m1", { categoria: "nota" });
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { categoria: "nota", enProgresoPorId: null, enProgresoDesde: null },
    });
  });

  it("cambiar la categoría a otra accionable NO limpia 'en curso ahora'", async () => {
    const { updateMessage } = await import("../src/app/(dashboard)/actions");
    await updateMessage("m1", { categoria: "recordatorio" });
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", workspaceId: "ws1" },
      data: { categoria: "recordatorio" },
    });
  });

  it("rechaza una categoría que no existe, sin tocar la BD", async () => {
    const { updateMessage } = await import("../src/app/(dashboard)/actions");
    const result = await updateMessage("m1", { categoria: "no-existe" });
    expect(result.error).toMatch(/categoría/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("rechaza con rol VIEWER, sin tocar la BD", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { updateMessage } = await import("../src/app/(dashboard)/actions");
    const result = await updateMessage("m1", { resumen: "X" });
    expect(result.error).toMatch(/solo lectura/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });
});
