import { describe, expect, it, vi, beforeEach } from "vitest";

const passwordResetTokenCreate = vi.fn();
const passwordResetTokenDeleteMany = vi.fn();
const passwordResetTokenFindUnique = vi.fn();
const passwordResetTokenDelete = vi.fn();
const userUpdate = vi.fn();
const transaction = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    passwordResetToken: {
      create: (...args: unknown[]) => passwordResetTokenCreate(...args),
      deleteMany: (...args: unknown[]) => passwordResetTokenDeleteMany(...args),
      findUnique: (...args: unknown[]) => passwordResetTokenFindUnique(...args),
      delete: (...args: unknown[]) => passwordResetTokenDelete(...args),
    },
    user: {
      update: (...args: unknown[]) => userUpdate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

describe("createPasswordResetToken", () => {
  beforeEach(() => {
    passwordResetTokenCreate.mockReset();
    passwordResetTokenDeleteMany.mockReset();
  });

  it("borra tokens viejos del usuario y crea uno nuevo, largo y aleatorio", async () => {
    const { createPasswordResetToken } = await import("../src/lib/passwordReset");
    const token = await createPasswordResetToken("u1");

    expect(passwordResetTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(passwordResetTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", token }) }),
    );
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("dos tokens generados seguidos son distintos", async () => {
    const { createPasswordResetToken } = await import("../src/lib/passwordReset");
    const a = await createPasswordResetToken("u1");
    const b = await createPasswordResetToken("u1");
    expect(a).not.toBe(b);
  });
});

describe("checkPasswordResetToken", () => {
  beforeEach(() => {
    passwordResetTokenFindUnique.mockReset();
  });

  it("token inexistente devuelve 'invalido'", async () => {
    passwordResetTokenFindUnique.mockResolvedValue(null);
    const { checkPasswordResetToken } = await import("../src/lib/passwordReset");
    expect(await checkPasswordResetToken("no-existe")).toBe("invalido");
  });

  it("token caducado devuelve 'caducado' sin borrarlo (solo consulta)", async () => {
    passwordResetTokenFindUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() - 1000),
    });
    const { checkPasswordResetToken } = await import("../src/lib/passwordReset");
    expect(await checkPasswordResetToken("abc")).toBe("caducado");
    expect(passwordResetTokenDelete).not.toHaveBeenCalled();
  });

  it("token válido devuelve 'ok'", async () => {
    passwordResetTokenFindUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    const { checkPasswordResetToken } = await import("../src/lib/passwordReset");
    expect(await checkPasswordResetToken("abc")).toBe("ok");
  });
});

describe("resetPasswordWithToken", () => {
  beforeEach(() => {
    passwordResetTokenFindUnique.mockReset();
    passwordResetTokenDelete.mockReset();
    passwordResetTokenDelete.mockResolvedValue({});
    userUpdate.mockReset();
    transaction.mockReset();
    transaction.mockResolvedValue([{}, {}]);
  });

  it("token inexistente devuelve status 'invalido'", async () => {
    passwordResetTokenFindUnique.mockResolvedValue(null);
    const { resetPasswordWithToken } = await import("../src/lib/passwordReset");
    expect(await resetPasswordWithToken("no-existe", "hash")).toEqual({ status: "invalido" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("token caducado se borra y devuelve status 'caducado'", async () => {
    passwordResetTokenFindUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() - 1000),
    });
    const { resetPasswordWithToken } = await import("../src/lib/passwordReset");
    expect(await resetPasswordWithToken("abc", "hash")).toEqual({ status: "caducado" });
    expect(passwordResetTokenDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("token válido guarda el nuevo hash, lo consume, y devuelve el userId", async () => {
    passwordResetTokenFindUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    const { resetPasswordWithToken } = await import("../src/lib/passwordReset");
    expect(await resetPasswordWithToken("abc", "nuevo-hash")).toEqual({ status: "ok", userId: "u1" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("si el token ya se consumió entretanto (transacción falla), devuelve 'invalido' sin fingir éxito", async () => {
    passwordResetTokenFindUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    transaction.mockRejectedValue(new Error("record not found"));
    const { resetPasswordWithToken } = await import("../src/lib/passwordReset");
    expect(await resetPasswordWithToken("abc", "nuevo-hash")).toEqual({ status: "invalido" });
  });
});
