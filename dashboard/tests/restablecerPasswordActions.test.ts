import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const REDIRECT_MARK = "NEXT_REDIRECT";
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`${REDIRECT_MARK}:${url}`);
  }),
}));

const hashPassword = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    hashPassword: (...args: unknown[]) => hashPassword(...args),
  };
});

const createSession = vi.fn();
vi.mock("@/lib/session", () => ({ createSession: (...args: unknown[]) => createSession(...args) }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  clientIp: async () => "203.0.113.5",
}));

const resetPasswordWithToken = vi.fn();
vi.mock("@/lib/passwordReset", () => ({
  resetPasswordWithToken: (...args: unknown[]) => resetPasswordWithToken(...args),
}));

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("resetPassword", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    hashPassword.mockReset();
    hashPassword.mockResolvedValue("hashed");
    createSession.mockReset();
    resetPasswordWithToken.mockReset();
  });

  it("sin token, rechaza como enlace no válido", async () => {
    const { resetPassword } = await import("../src/app/(auth)/restablecer-password/actions");
    const result = await resetPassword({}, formData({ password: "correcta1", passwordConfirm: "correcta1" }));
    expect(result).toEqual({ error: "Enlace no válido.", tokenInvalido: true });
    expect(resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña demasiado corta sin tocar la base de datos", async () => {
    const { resetPassword } = await import("../src/app/(auth)/restablecer-password/actions");
    const result = await resetPassword({}, formData({ token: "abc", password: "corta", passwordConfirm: "corta" }));
    expect(result.error).toMatch(/al menos/);
    expect(resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("rechaza si las contraseñas no coinciden", async () => {
    const { resetPassword } = await import("../src/app/(auth)/restablecer-password/actions");
    const result = await resetPassword({}, formData({ token: "abc", password: "correcta1", passwordConfirm: "otra12345" }));
    expect(result).toEqual({ error: "Las contraseñas no coinciden." });
    expect(resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("token caducado se refleja como tokenInvalido, con el mensaje adecuado", async () => {
    resetPasswordWithToken.mockResolvedValue({ status: "caducado" });
    const { resetPassword } = await import("../src/app/(auth)/restablecer-password/actions");
    const result = await resetPassword({}, formData({ token: "abc", password: "correcta1", passwordConfirm: "correcta1" }));
    expect(result.tokenInvalido).toBe(true);
    expect(result.error).toMatch(/caducado/);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("token inválido/ya usado se refleja como tokenInvalido", async () => {
    resetPasswordWithToken.mockResolvedValue({ status: "invalido" });
    const { resetPassword } = await import("../src/app/(auth)/restablecer-password/actions");
    const result = await resetPassword({}, formData({ token: "abc", password: "correcta1", passwordConfirm: "correcta1" }));
    expect(result.tokenInvalido).toBe(true);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("token válido cambia la contraseña, inicia sesión, y redirige a /", async () => {
    resetPasswordWithToken.mockResolvedValue({ status: "ok", userId: "u1" });
    const { resetPassword } = await import("../src/app/(auth)/restablecer-password/actions");
    await expect(
      resetPassword({}, formData({ token: "abc", password: "correcta1", passwordConfirm: "correcta1" })),
    ).rejects.toThrow(`${REDIRECT_MARK}:/`);
    expect(hashPassword).toHaveBeenCalledWith("correcta1");
    expect(resetPasswordWithToken).toHaveBeenCalledWith("abc", "hashed");
    expect(createSession).toHaveBeenCalledWith("u1");
  });

  it("respeta el freno de intentos por IP", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const { resetPassword } = await import("../src/app/(auth)/restablecer-password/actions");
    const result = await resetPassword({}, formData({ token: "abc", password: "correcta1", passwordConfirm: "correcta1" }));
    expect(result.error).toMatch(/Demasiados intentos/);
    expect(resetPasswordWithToken).not.toHaveBeenCalled();
  });
});
