import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
const eventoFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    evento: { findMany: (...args: unknown[]) => eventoFindMany(...args) },
  },
}));

beforeEach(() => {
  messageFindMany.mockReset();
  messageFindMany.mockResolvedValue([]);
  eventoFindMany.mockReset();
  eventoFindMany.mockResolvedValue([]);
});

describe("getTasksEnRango", () => {
  it("pide solo lo que de verdad ocupa un hueco en el calendario, dentro del rango", async () => {
    const { getTasksEnRango } = await import("../src/lib/eventos");
    await getTasksEnRango("ws1", new Date("2026-08-01"), new Date("2026-09-01"));

    const { where, orderBy } = messageFindMany.mock.calls[0]![0];
    // Del workspace activo, nunca de otro (alcance de visibilidad).
    expect(where.workspaceId).toBe("ws1");
    // Solo dentro del tramo que se está viendo, no el historial entero.
    expect(where.fechaLimite).toEqual({ gte: new Date("2026-08-01"), lt: new Date("2026-09-01") });
    // Una tarea ya hecha no es algo que "toque" ese día: solo ensuciaría el mes.
    expect(where.estado).toEqual({ not: "HECHO" });
    // Ordenadas por vencimiento: lo que antes vence, primero.
    expect(orderBy).toEqual({ fechaLimite: "asc" });
  });

  it("se limita a categorías accionables — una idea con fecha no es una entrega", async () => {
    const { getTasksEnRango } = await import("../src/lib/eventos");
    await getTasksEnRango("ws1", new Date("2026-08-01"), new Date("2026-09-01"));

    const categorias = messageFindMany.mock.calls[0]![0].where.categoria.in as string[];
    expect(categorias).toContain("tarea");
    expect(categorias).toContain("recordatorio");
    expect(categorias).not.toContain("idea");
  });
});

describe("getEventosEnRango", () => {
  it("incluye los eventos que SOLAPAN el rango, no solo los que empiezan dentro", async () => {
    const { getEventosEnRango } = await import("../src/lib/eventos");
    await getEventosEnRango("ws1", new Date("2026-08-01"), new Date("2026-09-01"));

    const { where } = eventoFindMany.mock.calls[0]![0];
    // Un evento de enero a marzo tiene que verse al mirar febrero: por eso
    // vale con que su FIN caiga dentro, aunque empezara antes.
    expect(where.OR).toEqual([
      { fechaFin: null, fechaInicio: { gte: new Date("2026-08-01") } },
      { fechaFin: { gte: new Date("2026-08-01") } },
    ]);
    expect(where.fechaInicio).toEqual({ lt: new Date("2026-09-01") });
  });
});
