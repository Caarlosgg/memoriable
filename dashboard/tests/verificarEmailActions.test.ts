import { describe, expect, it, vi, beforeEach } from "vitest";

const REDIRECT_MARK = "NEXT_REDIRECT";
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`${REDIRECT_MARK}:${url}`);
  }),
}));

const verifyEmailToken = vi.fn();
vi.mock("@/lib/verification", () => ({
  verifyEmailToken: (...args: unknown[]) => verifyEmailToken(...args),
}));

const createSession = vi.fn();
vi.mock("@/lib/session", () => ({ createSession: (...args: unknown[]) => createSession(...args) }));

function formData(token: string): FormData {
  const fd = new FormData();
  fd.set("token", token);
  return fd;
}

describe("confirmarEmail", () => {
  beforeEach(() => {
    verifyEmailToken.mockReset();
    createSession.mockReset();
  });

  it("con un token válido inicia sesión y entra directo, sin pasar por /login", async () => {
    verifyEmailToken.mockResolvedValue({ status: "ok", userId: "u1" });
    const { confirmarEmail } = await import("../src/app/(auth)/verificar-email/actions");
    await expect(confirmarEmail({}, formData("abc"))).rejects.toThrow(`${REDIRECT_MARK}:/inicio`);
    expect(createSession).toHaveBeenCalledWith("u1");
  });

  it("con un token caducado no abre sesión ni redirige", async () => {
    verifyEmailToken.mockResolvedValue({ status: "caducado" });
    const { confirmarEmail } = await import("../src/app/(auth)/verificar-email/actions");
    const result = await confirmarEmail({}, formData("abc"));
    expect(result).toEqual({ status: "caducado" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("sin token no llega siquiera a consultar la base de datos", async () => {
    const { confirmarEmail } = await import("../src/app/(auth)/verificar-email/actions");
    const result = await confirmarEmail({}, formData(""));
    expect(result).toEqual({ status: "invalido" });
    expect(verifyEmailToken).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
