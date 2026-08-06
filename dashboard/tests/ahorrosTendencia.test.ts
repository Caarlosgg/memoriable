import { describe, expect, it, vi, beforeEach } from "vitest";

const movimientoFindMany = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    movimientoAhorro: { findMany: (...args: unknown[]) => movimientoFindMany(...args) },
  },
}));

import { getTendenciasPorCuenta, describeTrend } from "../src/lib/ahorros";

describe("getTendenciasPorCuenta", () => {
  beforeEach(() => {
    movimientoFindMany.mockReset();
  });

  it("agrupa el neto de este mes y del anterior, por cuenta", async () => {
    const now = new Date(2026, 7, 15); // 15 ago 2026
    movimientoFindMany.mockResolvedValue([
      { cuentaId: "c1", centimos: 5000, fecha: new Date(2026, 7, 10) }, // ago (este mes)
      { cuentaId: "c1", centimos: 2000, fecha: new Date(2026, 7, 12) }, // ago
      { cuentaId: "c1", centimos: 3000, fecha: new Date(2026, 6, 20) }, // jul (mes anterior)
      { cuentaId: "c2", centimos: -1000, fecha: new Date(2026, 6, 5) }, // jul
    ]);

    const result = await getTendenciasPorCuenta("u1", now);

    expect(result.get("c1")).toEqual({ esteMesCentimos: 7000, mesAnteriorCentimos: 3000 });
    expect(result.get("c2")).toEqual({ esteMesCentimos: 0, mesAnteriorCentimos: -1000 });
  });

  it("pide solo movimientos ligados al usuario, desde el inicio del mes anterior", async () => {
    const now = new Date(2026, 7, 15);
    movimientoFindMany.mockResolvedValue([]);
    await getTendenciasPorCuenta("u1", now);

    expect(movimientoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cuenta: { userId: "u1" }, fecha: { gte: new Date(2026, 6, 1) } },
      }),
    );
  });

  it("sin movimientos, devuelve un mapa vacío", async () => {
    movimientoFindMany.mockResolvedValue([]);
    const result = await getTendenciasPorCuenta("u1", new Date(2026, 7, 15));
    expect(result.size).toBe(0);
  });
});

describe("describeTrend", () => {
  it("sin datos del mes anterior, no hay nada que comparar (null)", () => {
    expect(describeTrend({ esteMesCentimos: 5000, mesAnteriorCentimos: 0 })).toBeNull();
  });

  it("una diferencia insignificante (< 1€) no merece aviso", () => {
    expect(describeTrend({ esteMesCentimos: 3050, mesAnteriorCentimos: 3000 })).toBeNull();
  });

  it("mejora clara respecto al mes anterior", () => {
    expect(describeTrend({ esteMesCentimos: 8000, mesAnteriorCentimos: 3000 })).toMatch(/más/);
  });

  it("empeora claramente respecto al mes anterior", () => {
    expect(describeTrend({ esteMesCentimos: 1000, mesAnteriorCentimos: 3000 })).toMatch(/menos/);
  });
});
