import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
const movimientoFindMany = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    movimientoAhorro: { findMany: (...args: unknown[]) => movimientoFindMany(...args) },
  },
}));

import { groupByWeek, computeSavingsStreak, computeSavingsEvolution, getInsights } from "../src/lib/insights";

describe("groupByWeek", () => {
  it("agrupa por semana (lunes a domingo), la más antigua primero", () => {
    const now = new Date(2026, 7, 5); // miércoles 5 ago 2026 (semana del lunes 3 ago)
    const dates = [
      new Date(2026, 7, 3), // lunes de esta semana
      new Date(2026, 7, 4), // martes de esta semana
      new Date(2026, 6, 27), // semana anterior
    ];
    const result = groupByWeek(dates, 2, now);
    expect(result).toEqual([
      { weekStart: "2026-07-27", count: 1 },
      { weekStart: "2026-08-03", count: 2 },
    ]);
  });

  it("una fecha fuera del rango de semanas no cuenta en ningún cubo", () => {
    const now = new Date(2026, 7, 5);
    const result = groupByWeek([new Date(2026, 0, 1)], 2, now);
    expect(result.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });

  it("sin fechas, todos los cubos están a 0", () => {
    const result = groupByWeek([], 3, new Date(2026, 7, 5));
    expect(result.every((b) => b.count === 0)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it("un domingo cae en la semana que empezó el lunes anterior", () => {
    const now = new Date(2026, 7, 5);
    const domingo = new Date(2026, 7, 2); // domingo 2 ago -> semana del lunes 27 jul
    const result = groupByWeek([domingo], 2, now);
    expect(result[0]).toEqual({ weekStart: "2026-07-27", count: 1 });
  });
});

describe("computeSavingsStreak", () => {
  it("cuenta semanas consecutivas con ahorro neto positivo, empezando por la actual", () => {
    const now = new Date(2026, 7, 5); // semana del 3 ago
    const movimientos = [
      { fecha: new Date(2026, 7, 3), centimos: 5000 }, // esta semana: +50
      { fecha: new Date(2026, 6, 28), centimos: 3000 }, // semana anterior: +30
      { fecha: new Date(2026, 6, 21), centimos: 2000 }, // dos semanas atrás: +20
    ];
    expect(computeSavingsStreak(movimientos, now)).toBe(3);
  });

  it("se para en la primera semana sin movimientos (racha rota por un hueco)", () => {
    const now = new Date(2026, 7, 5);
    const movimientos = [
      { fecha: new Date(2026, 7, 3), centimos: 5000 },
      // sin nada la semana anterior
      { fecha: new Date(2026, 6, 21), centimos: 2000 },
    ];
    expect(computeSavingsStreak(movimientos, now)).toBe(1);
  });

  it("se para en la primera semana con neto negativo o cero", () => {
    const now = new Date(2026, 7, 5);
    const movimientos = [
      { fecha: new Date(2026, 7, 3), centimos: 5000 },
      { fecha: new Date(2026, 6, 28), centimos: -1000 }, // retirada neta esa semana
    ];
    expect(computeSavingsStreak(movimientos, now)).toBe(1);
  });

  it("0 si esta semana todavía no tiene ahorro neto positivo", () => {
    const now = new Date(2026, 7, 5);
    expect(computeSavingsStreak([], now)).toBe(0);
  });
});

describe("computeSavingsEvolution", () => {
  it("acumula el saldo mes a mes, más antiguo primero", () => {
    const now = new Date(2026, 7, 15); // ago 2026
    const movimientos = [
      { fecha: new Date(2026, 5, 10), centimos: 10000 }, // jun: +100
      { fecha: new Date(2026, 6, 5), centimos: 5000 }, // jul: +50 (acumulado 150)
      { fecha: new Date(2026, 7, 1), centimos: -2000 }, // ago: -20 (acumulado 130)
    ];
    const result = computeSavingsEvolution(movimientos, 3, now);
    expect(result).toEqual([
      { month: "2026-06", balanceCentimos: 10000 },
      { month: "2026-07", balanceCentimos: 15000 },
      { month: "2026-08", balanceCentimos: 13000 },
    ]);
  });

  it("un movimiento futuro respecto al mes en curso no se cuenta", () => {
    const now = new Date(2026, 7, 15);
    const result = computeSavingsEvolution([{ fecha: new Date(2026, 8, 1), centimos: 5000 }], 2, now);
    expect(result.at(-1)!.balanceCentimos).toBe(0);
  });

  it("sin movimientos, todos los meses quedan a saldo 0", () => {
    const result = computeSavingsEvolution([], 3, new Date(2026, 7, 15));
    expect(result.every((p) => p.balanceCentimos === 0)).toBe(true);
  });
});

describe("getInsights", () => {
  beforeEach(() => {
    messageFindMany.mockReset();
    messageFindMany.mockResolvedValue([]);
    movimientoFindMany.mockReset();
    movimientoFindMany.mockResolvedValue([]);
  });

  it("consulta notas y movimientos ligados al usuario de la sesión", async () => {
    await getInsights("u1");

    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }),
    );
    expect(movimientoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cuenta: { userId: "u1" } }) }),
    );
  });

  it("compone las tres piezas (semanas, racha, evolución) en un único objeto", async () => {
    const result = await getInsights("u1");
    expect(result.notesByWeek).toHaveLength(6);
    expect(result.savingsEvolution).toHaveLength(6);
    expect(typeof result.savingsStreak).toBe("number");
  });
});
