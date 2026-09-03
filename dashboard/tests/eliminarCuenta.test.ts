import { describe, expect, it, vi, beforeEach } from "vitest";

const userFindUnique = vi.fn();
const membershipFindMany = vi.fn();
const membershipCount = vi.fn();
const messageCount = vi.fn();
const eventoCount = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a), delete: vi.fn() },
    membership: {
      findMany: (...a: unknown[]) => membershipFindMany(...a),
      count: (...a: unknown[]) => membershipCount(...a),
    },
    message: { count: (...a: unknown[]) => messageCount(...a), deleteMany: vi.fn() },
    evento: { count: (...a: unknown[]) => eventoCount(...a), deleteMany: vi.fn() },
    assistantExchange: { deleteMany: vi.fn() },
    conversation: { deleteMany: vi.fn() },
    cuentaAhorro: { deleteMany: vi.fn() },
    workspace: { delete: vi.fn() },
    $transaction: (ops: unknown) => transaction(ops),
  },
}));

beforeEach(() => {
  userFindUnique.mockReset();
  userFindUnique.mockResolvedValue({ personalWorkspaceId: "ws-personal" });
  membershipFindMany.mockReset();
  membershipFindMany.mockResolvedValue([]);
  membershipCount.mockReset();
  membershipCount.mockResolvedValue(0);
  messageCount.mockReset();
  messageCount.mockResolvedValue(0);
  eventoCount.mockReset();
  eventoCount.mockResolvedValue(0);
  transaction.mockReset();
  transaction.mockResolvedValue([]);
});

describe("eliminarCuenta", () => {
  it("borra la cuenta cuando solo tiene su espacio personal", async () => {
    const { eliminarCuenta } = await import("@/lib/eliminarCuenta");

    expect(await eliminarCuenta("ana")).toEqual({});
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("se niega si eres el ÚNICO propietario de un equipo, y dice qué hacer", async () => {
    // Un equipo sin propietario no lo puede administrar nadie: arrastrar el
    // equipo de otras personas no es una consecuencia aceptable de que uno
    // se dé de baja.
    membershipFindMany.mockResolvedValue([
      { workspaceId: "ws-equipo", workspace: { nombre: "Obrador" } },
    ]);
    membershipCount.mockResolvedValue(0);
    const { eliminarCuenta } = await import("@/lib/eliminarCuenta");

    const res = await eliminarCuenta("ana");

    expect(res.error).toContain("Obrador");
    expect(res.error).toMatch(/propiedad|elimina el equipo/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("si el equipo tiene OTRO propietario, no bloquea", async () => {
    membershipFindMany.mockResolvedValue([
      { workspaceId: "ws-equipo", workspace: { nombre: "Obrador" } },
    ]);
    membershipCount.mockResolvedValue(1);
    const { eliminarCuenta } = await import("@/lib/eliminarCuenta");

    expect(await eliminarCuenta("ana")).toEqual({});
  });

  it("se niega si dejaría notas de un equipo sin autor", async () => {
    messageCount.mockResolvedValue(3);
    const { eliminarCuenta } = await import("@/lib/eliminarCuenta");

    const res = await eliminarCuenta("ana");

    expect(res.error).toMatch(/equipo compartido/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("un evento compartido bloquea igual que una nota", async () => {
    eventoCount.mockResolvedValue(1);
    const { eliminarCuenta } = await import("@/lib/eliminarCuenta");

    expect((await eliminarCuenta("ana")).error).toMatch(/equipo compartido/i);
  });

  it("no borra nada si la cuenta no existe", async () => {
    userFindUnique.mockResolvedValue(null);
    const { eliminarCuenta } = await import("@/lib/eliminarCuenta");

    expect((await eliminarCuenta("fantasma")).error).toBeTruthy();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("todo el borrado va en UNA transacción: una cuenta a medio borrar es peor que cualquier estado completo", async () => {
    const { eliminarCuenta } = await import("@/lib/eliminarCuenta");
    await eliminarCuenta("ana");

    const ops = transaction.mock.calls[0]![0] as unknown[];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops.length).toBeGreaterThan(5);
  });
});
