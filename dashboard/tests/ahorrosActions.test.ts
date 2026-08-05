import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const cuentaCreate = vi.fn();
const cuentaDeleteMany = vi.fn();
const cuentaFindFirst = vi.fn();
const movimientoCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cuentaAhorro: {
      create: (...args: unknown[]) => cuentaCreate(...args),
      deleteMany: (...args: unknown[]) => cuentaDeleteMany(...args),
      findFirst: (...args: unknown[]) => cuentaFindFirst(...args),
    },
    movimientoAhorro: {
      create: (...args: unknown[]) => movimientoCreate(...args),
    },
  },
}));

const getMovimientos = vi.fn();
vi.mock("@/lib/ahorros", () => ({
  getMovimientos: (...args: unknown[]) => getMovimientos(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

describe("createCuenta", () => {
  beforeEach(() => {
    cuentaCreate.mockReset();
    cuentaCreate.mockResolvedValue({ id: "c1" });
    revalidatePath.mockReset();
  });

  it("rechaza un nombre vacío (o solo espacios)", async () => {
    const { createCuenta } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await createCuenta("   ", null);
    expect(result.error).toMatch(/nombre/);
    expect(cuentaCreate).not.toHaveBeenCalled();
  });

  it("crea la cuenta ligada al usuario de la sesión, con objetivo opcional, e invalida /ahorros", async () => {
    const { createCuenta } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await createCuenta("Fondo de emergencia", 100000);
    expect(result.error).toBeUndefined();
    expect(cuentaCreate).toHaveBeenCalledWith({
      data: { userId: "u1", nombre: "Fondo de emergencia", objetivoCentimos: 100000 },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/ahorros");
  });

  it("un fallo al guardar se traduce a un mensaje genérico en español", async () => {
    cuentaCreate.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { createCuenta } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await createCuenta("Viaje", null);
    expect(result.error).toMatch(/No se ha podido crear/);
  });
});

describe("deleteCuenta", () => {
  it("borra solo si la cuenta pertenece al usuario (deleteMany con userId en el where)", async () => {
    cuentaDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteCuenta } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await deleteCuenta("c1");
    expect(result.error).toBeUndefined();
    expect(cuentaDeleteMany).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1" } });
  });
});

describe("addMovimiento", () => {
  beforeEach(() => {
    cuentaFindFirst.mockReset();
    cuentaFindFirst.mockResolvedValue({ id: "c1", userId: "u1" });
    movimientoCreate.mockReset();
    movimientoCreate.mockResolvedValue({ id: "m1" });
    revalidatePath.mockReset();
  });

  it("rechaza un importe de cero", async () => {
    const { addMovimiento } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await addMovimiento("c1", 0, null);
    expect(result.error).toMatch(/no puede ser cero/);
    expect(movimientoCreate).not.toHaveBeenCalled();
  });

  it("rechaza un importe no finito (NaN/Infinity)", async () => {
    const { addMovimiento } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await addMovimiento("c1", NaN, null);
    expect(result.error).toBeDefined();
    expect(movimientoCreate).not.toHaveBeenCalled();
  });

  it("comprueba que la cuenta pertenece al usuario ANTES de insertar el movimiento (MovimientoAhorro no tiene userId propio)", async () => {
    cuentaFindFirst.mockResolvedValue(null);
    const { addMovimiento } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await addMovimiento("c-ajena", 1000, null);
    expect(result.error).toMatch(/No se ha encontrado la cuenta/);
    expect(cuentaFindFirst).toHaveBeenCalledWith({ where: { id: "c-ajena", userId: "u1" } });
    expect(movimientoCreate).not.toHaveBeenCalled();
  });

  it("registra el ingreso/retirada e invalida /ahorros", async () => {
    const { addMovimiento } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await addMovimiento("c1", -500, "Reparación");
    expect(result.error).toBeUndefined();
    expect(movimientoCreate).toHaveBeenCalledWith({
      data: { cuentaId: "c1", centimos: -500, concepto: "Reparación" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/ahorros");
  });
});

describe("listMovimientos", () => {
  it("delega en lib/ahorros con el userId de la sesión", async () => {
    getMovimientos.mockResolvedValue([{ id: "m1" }]);
    const { listMovimientos } = await import("../src/app/(dashboard)/ahorros/actions");
    const result = await listMovimientos("c1");
    expect(getMovimientos).toHaveBeenCalledWith("c1", "u1");
    expect(result).toEqual([{ id: "m1" }]);
  });
});
