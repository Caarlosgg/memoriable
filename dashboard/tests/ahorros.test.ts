import { describe, expect, it, vi, beforeEach } from "vitest";

// A diferencia de ahorrosActions.test.ts y assistantTools.test.ts (que
// mockean `@/lib/ahorros` entero), aquí se importa el módulo REAL: es la
// única forma de comprobar que la aritmética del saldo — cuánto dinero
// dice la app que tiene el usuario — es correcta de verdad, y no solo que
// quien la llama sepa reaccionar a lo que un mock le devuelva.
const cuentaFindMany = vi.fn();
const movimientoGroupBy = vi.fn();
const movimientoFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cuentaAhorro: { findMany: (...a: unknown[]) => cuentaFindMany(...a) },
    movimientoAhorro: {
      groupBy: (...a: unknown[]) => movimientoGroupBy(...a),
      findMany: (...a: unknown[]) => movimientoFindMany(...a),
    },
  },
}));

beforeEach(() => {
  cuentaFindMany.mockReset();
  movimientoGroupBy.mockReset();
  movimientoFindMany.mockReset();
});

describe("getCuentasConSaldo", () => {
  it("el saldo es la suma real en céntimos de los movimientos, agrupados por cuenta", async () => {
    cuentaFindMany.mockResolvedValue([
      { id: "c1", userId: "u1", nombre: "Vacaciones", createdAt: new Date("2026-01-01") },
      { id: "c2", userId: "u1", nombre: "Emergencias", createdAt: new Date("2026-02-01") },
    ]);
    movimientoGroupBy.mockResolvedValue([
      { cuentaId: "c1", _sum: { centimos: 15000 } },
      { cuentaId: "c2", _sum: { centimos: -2500 } },
    ]);
    const { getCuentasConSaldo } = await import("../src/lib/ahorros");

    const result = await getCuentasConSaldo("u1");

    expect(result).toEqual([
      expect.objectContaining({ id: "c1", saldoCentimos: 15000 }),
      expect.objectContaining({ id: "c2", saldoCentimos: -2500 }),
    ]);
  });

  it("una cuenta sin ningún movimiento tiene saldo 0, no undefined ni un fallo", async () => {
    cuentaFindMany.mockResolvedValue([
      { id: "c1", userId: "u1", nombre: "Nueva", createdAt: new Date("2026-01-01") },
    ]);
    // `groupBy` no devuelve fila para una cuenta sin movimientos — no hay
    // nada que sumar, así que Postgres/Prisma simplemente la omite.
    movimientoGroupBy.mockResolvedValue([]);
    const { getCuentasConSaldo } = await import("../src/lib/ahorros");

    const result = await getCuentasConSaldo("u1");

    expect(result[0]!.saldoCentimos).toBe(0);
  });

  it("pide las cuentas filtradas por dueño, más antigua primero", async () => {
    cuentaFindMany.mockResolvedValue([]);
    movimientoGroupBy.mockResolvedValue([]);
    const { getCuentasConSaldo } = await import("../src/lib/ahorros");

    await getCuentasConSaldo("u1");

    expect(cuentaFindMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("getMovimientos", () => {
  it("filtra por dueño a través de la relación con la cuenta, no con un userId propio", async () => {
    movimientoFindMany.mockResolvedValue([]);
    const { getMovimientos } = await import("../src/lib/ahorros");

    await getMovimientos("c1", "u1");

    // MovimientoAhorro no tiene userId propio — el dueño se comprueba
    // SIEMPRE a través de `cuenta.userId`, para que el id de un movimiento
    // ajeno no se pueda consultar cambiando solo el cuentaId.
    expect(movimientoFindMany).toHaveBeenCalledWith({
      where: { cuentaId: "c1", cuenta: { userId: "u1" } },
      orderBy: { fecha: "desc" },
    });
  });
});
