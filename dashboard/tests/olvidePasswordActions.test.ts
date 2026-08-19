import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  clientIp: async () => "203.0.113.5",
}));

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

const createPasswordResetToken = vi.fn();
vi.mock("@/lib/passwordReset", () => ({
  createPasswordResetToken: (...args: unknown[]) => createPasswordResetToken(...args),
}));

const sendPasswordResetEmail = vi.fn();
const resolveBaseUrl = vi.fn();
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...args),
  resolveBaseUrl: (...args: unknown[]) => resolveBaseUrl(...args),
}));

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("requestPasswordReset", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    userFindUnique.mockReset();
    createPasswordResetToken.mockReset();
    createPasswordResetToken.mockResolvedValue("token123");
    sendPasswordResetEmail.mockReset();
    sendPasswordResetEmail.mockResolvedValue(true);
    resolveBaseUrl.mockReset();
    resolveBaseUrl.mockResolvedValue("http://localhost:3000");
  });

  it("manda el enlace si la cuenta existe y tiene contraseña propia", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", passwordHash: "hash" });
    const { requestPasswordReset } = await import("../src/app/(auth)/olvide-password/actions");
    const result = await requestPasswordReset({}, formData({ email: "ana@example.com" }));
    expect(createPasswordResetToken).toHaveBeenCalledWith("u1");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("ana@example.com", "http://localhost:3000/restablecer-password?token=token123");
    expect(result).toEqual({ sent: true });
  });

  it("responde 'sent: true' igual aunque la cuenta no exista (no revela nada)", async () => {
    userFindUnique.mockResolvedValue(null);
    const { requestPasswordReset } = await import("../src/app/(auth)/olvide-password/actions");
    const result = await requestPasswordReset({}, formData({ email: "nadie@example.com" }));
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: true });
  });

  it("no manda nada para una cuenta solo-Google (sin passwordHash) — no tiene contraseña que cambiar", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", passwordHash: null });
    const { requestPasswordReset } = await import("../src/app/(auth)/olvide-password/actions");
    const result = await requestPasswordReset({}, formData({ email: "ana@example.com" }));
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: true });
  });

  it("rechaza sin email", async () => {
    const { requestPasswordReset } = await import("../src/app/(auth)/olvide-password/actions");
    const result = await requestPasswordReset({}, formData({}));
    expect(result).toEqual({ error: "Escribe tu email." });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("respeta el freno de intentos por IP", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const { requestPasswordReset } = await import("../src/app/(auth)/olvide-password/actions");
    const result = await requestPasswordReset({}, formData({ email: "ana@example.com" }));
    expect(result.error).toMatch(/Demasiados intentos/);
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});
