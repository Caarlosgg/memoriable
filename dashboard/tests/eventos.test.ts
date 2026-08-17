import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    evento: { findMany: vi.fn() },
  },
}));

beforeEach(() => {
  messageFindMany.mockReset();
  messageFindMany.mockResolvedValue([]);
});

describe("getTasksWithDeadline", () => {
  it("pide solo lo que de verdad ocupa un hueco en el calendario", async () => {
    const { getTasksWithDeadline } = await import("../src/lib/eventos");
    await getTasksWithDeadline("ws1");

    const { where, orderBy } = messageFindMany.mock.calls[0]![0];
    // Del workspace activo, nunca de otro (alcance de visibilidad).
    expect(where.workspaceId).toBe("ws1");
    // Sin fecha límite no hay día donde pintarla.
    expect(where.fechaLimite).toEqual({ not: null });
    // Una tarea ya hecha no es algo que "toque" ese día: solo ensuciaría el mes.
    expect(where.estado).toEqual({ not: "HECHO" });
    // Ordenadas por vencimiento: lo que antes vence, primero.
    expect(orderBy).toEqual({ fechaLimite: "asc" });
  });

  it("se limita a categorías accionables — una idea con fecha no es una entrega", async () => {
    const { getTasksWithDeadline } = await import("../src/lib/eventos");
    await getTasksWithDeadline("ws1");

    const categorias = messageFindMany.mock.calls[0]![0].where.categoria.in as string[];
    expect(categorias).toContain("tarea");
    expect(categorias).toContain("recordatorio");
    expect(categorias).not.toContain("idea");
  });
});
