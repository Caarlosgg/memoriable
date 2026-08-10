import { describe, expect, it, vi, beforeEach } from "vitest";

const messageCount = vi.fn();
const eventoFindMany = vi.fn();
const eventoCount = vi.fn();
const workspaceFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { count: (...args: unknown[]) => messageCount(...args) },
    evento: {
      findMany: (...args: unknown[]) => eventoFindMany(...args),
      count: (...args: unknown[]) => eventoCount(...args),
    },
    workspace: { findUnique: (...args: unknown[]) => workspaceFindUnique(...args) },
  },
}));

beforeEach(() => {
  messageCount.mockReset();
  eventoFindMany.mockReset();
  eventoCount.mockReset();
  workspaceFindUnique.mockReset();
});

describe("resolveAmbientStats", () => {
  it("combina el conteo de pendientes y los eventos próximos (workspace-scoped)", async () => {
    messageCount.mockResolvedValue(3);
    eventoFindMany.mockResolvedValue([
      { titulo: "Reunión", fechaInicio: new Date("2026-08-13T10:00:00.000Z") },
    ]);
    eventoCount.mockResolvedValue(1);

    const { resolveAmbientStats } = await import("../src/lib/assistantAmbient");
    const stats = await resolveAmbientStats("ws1");

    expect(stats.pendientesCount).toBe(3);
    expect(stats.eventosProximosCount).toBe(1);
    expect(stats.eventosProximos).toEqual([{ titulo: "Reunión", fecha: expect.any(String) }]);

    expect(messageCount).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", categoria: { in: ["tarea", "recordatorio"] }, estado: { not: "HECHO" } },
    });
    const [findManyArgs] = eventoFindMany.mock.calls[0]!;
    expect(findManyArgs.where.workspaceId).toBe("ws1");
    expect(findManyArgs.take).toBe(3);
  });
});

describe("resolveWorkspaceNombre", () => {
  it("devuelve el nombre del workspace", async () => {
    workspaceFindUnique.mockResolvedValue({ nombre: "Marketing" });
    const { resolveWorkspaceNombre } = await import("../src/lib/assistantAmbient");
    expect(await resolveWorkspaceNombre("ws1")).toBe("Marketing");
    expect(workspaceFindUnique).toHaveBeenCalledWith({ where: { id: "ws1" }, select: { nombre: true } });
  });

  it("devuelve undefined si el workspace no existe", async () => {
    workspaceFindUnique.mockResolvedValue(null);
    const { resolveWorkspaceNombre } = await import("../src/lib/assistantAmbient");
    expect(await resolveWorkspaceNombre("ws-ajeno")).toBeUndefined();
  });
});
