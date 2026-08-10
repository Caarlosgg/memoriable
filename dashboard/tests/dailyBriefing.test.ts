import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
const eventoFindMany = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    evento: { findMany: (...args: unknown[]) => eventoFindMany(...args) },
  },
}));

function pendiente(overrides: Partial<{ id: string; resumen: string; categoria: string; fecha: Date }> = {}) {
  return {
    id: "p1",
    resumen: "Llamar al fontanero",
    categoria: "tarea",
    fecha: new Date(),
    ...overrides,
  };
}

describe("getDailyBriefing", () => {
  beforeEach(() => {
    messageFindMany.mockReset();
    eventoFindMany.mockReset();
    messageFindMany.mockResolvedValue([]);
    eventoFindMany.mockResolvedValue([]);
  });

  it("sin pendientes ni eventos, misionPrincipal es null y totalPendientes 0", async () => {
    const { getDailyBriefing } = await import("../src/lib/dailyBriefing");
    const data = await getDailyBriefing("u1");
    expect(data.misionPrincipal).toBeNull();
    expect(data.eventosHoy).toEqual([]);
    expect(data.totalPendientes).toBe(0);
    expect(data.atascadas).toBe(0);
  });

  it("la misión principal es la pendiente más antigua (primera del array ya ordenado por fecha asc)", async () => {
    messageFindMany.mockResolvedValue([
      pendiente({ id: "vieja", resumen: "La más antigua", fecha: new Date("2026-08-01") }),
      pendiente({ id: "nueva", resumen: "La más reciente", fecha: new Date("2026-08-05") }),
    ]);
    const { getDailyBriefing } = await import("../src/lib/dailyBriefing");
    const data = await getDailyBriefing("u1");
    expect(data.misionPrincipal?.id).toBe("vieja");
    expect(data.totalPendientes).toBe(2);
  });

  it("cuenta como atascadas las pendientes de hace más de 5 días", async () => {
    const hace10dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const hace1dia = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    messageFindMany.mockResolvedValue([pendiente({ fecha: hace10dias }), pendiente({ id: "p2", fecha: hace1dia })]);
    const { getDailyBriefing } = await import("../src/lib/dailyBriefing");
    const data = await getDailyBriefing("u1");
    expect(data.atascadas).toBe(1);
  });

  it("solo pide mensajes accionables (tarea/recordatorio) sin hacer, del workspace dado", async () => {
    const { getDailyBriefing } = await import("../src/lib/dailyBriefing");
    await getDailyBriefing("u1");
    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "u1", categoria: { in: ["tarea", "recordatorio"] }, estado: { not: "HECHO" } },
      }),
    );
  });

  it("pide eventos de hoy dentro del rango [inicio del día, inicio del día siguiente)", async () => {
    const { getDailyBriefing } = await import("../src/lib/dailyBriefing");
    await getDailyBriefing("u1");
    const call = eventoFindMany.mock.calls[0]![0];
    expect(call.where.workspaceId).toBe("u1");
    const { gte, lt } = call.where.fechaInicio;
    expect(lt.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(gte.getHours()).toBe(0);
  });
});
