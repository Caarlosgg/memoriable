import { describe, expect, it, vi, beforeEach } from "vitest";

const verificationTokenCreate = vi.fn();
const verificationTokenDeleteMany = vi.fn();
const verificationTokenFindUnique = vi.fn();
const verificationTokenDelete = vi.fn();
const userUpdate = vi.fn();
const transaction = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    verificationToken: {
      create: (...args: unknown[]) => verificationTokenCreate(...args),
      deleteMany: (...args: unknown[]) => verificationTokenDeleteMany(...args),
      findUnique: (...args: unknown[]) => verificationTokenFindUnique(...args),
      delete: (...args: unknown[]) => verificationTokenDelete(...args),
    },
    user: {
      update: (...args: unknown[]) => userUpdate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

describe("createVerificationToken", () => {
  beforeEach(() => {
    verificationTokenCreate.mockReset();
    verificationTokenDeleteMany.mockReset();
  });

  it("borra tokens viejos del usuario y crea uno nuevo, largo y aleatorio", async () => {
    const { createVerificationToken } = await import("../src/lib/verification");
    const token = await createVerificationToken("u1");

    expect(verificationTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(verificationTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", token }) }),
    );
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("dos tokens generados seguidos son distintos", async () => {
    const { createVerificationToken } = await import("../src/lib/verification");
    const a = await createVerificationToken("u1");
    const b = await createVerificationToken("u1");
    expect(a).not.toBe(b);
  });
});

describe("verifyEmailToken", () => {
  beforeEach(() => {
    verificationTokenFindUnique.mockReset();
    verificationTokenDelete.mockReset();
    verificationTokenDelete.mockResolvedValue({});
    userUpdate.mockReset();
    transaction.mockReset();
    transaction.mockResolvedValue([{}, {}]);
  });

  it("token inexistente devuelve 'invalido'", async () => {
    verificationTokenFindUnique.mockResolvedValue(null);
    const { verifyEmailToken } = await import("../src/lib/verification");
    expect(await verifyEmailToken("no-existe")).toEqual({ status: "invalido" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("token caducado se borra y devuelve 'caducado'", async () => {
    verificationTokenFindUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() - 1000),
    });
    const { verifyEmailToken } = await import("../src/lib/verification");
    expect(await verifyEmailToken("abc")).toEqual({ status: "caducado" });
    expect(verificationTokenDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("token válido marca la cuenta como verificada y lo consume", async () => {
    verificationTokenFindUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    const { verifyEmailToken } = await import("../src/lib/verification");
    // El userId es lo que permite el auto-login tras confirmar: sin él, la
    // acción no tendría a quién abrirle sesión.
    expect(await verifyEmailToken("abc")).toEqual({ status: "ok", userId: "u1" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
