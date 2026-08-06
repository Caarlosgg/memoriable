import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const REDIRECT_MARK = "NEXT_REDIRECT";
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`${REDIRECT_MARK}:${url}`);
  }),
}));

const verifyPasswordConstantTime = vi.fn();
const needsRehash = vi.fn();
const hashPassword = vi.fn();
vi.mock("@/lib/auth", () => ({
  verifyPasswordConstantTime: (...args: unknown[]) => verifyPasswordConstantTime(...args),
  needsRehash: (...args: unknown[]) => needsRehash(...args),
  hashPassword: (...args: unknown[]) => hashPassword(...args),
}));

const createSession = vi.fn();
vi.mock("@/lib/session", () => ({ createSession: (...args: unknown[]) => createSession(...args) }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  clientIp: async () => "203.0.113.5",
}));

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

const createVerificationToken = vi.fn();
vi.mock("@/lib/verification", () => ({
  createVerificationToken: (...args: unknown[]) => createVerificationToken(...args),
}));

const sendVerificationEmail = vi.fn();
const resolveBaseUrl = vi.fn();
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args),
  resolveBaseUrl: (...args: unknown[]) => resolveBaseUrl(...args),
}));

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("login", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    userFindUnique.mockReset();
    userUpdate.mockReset();
    verifyPasswordConstantTime.mockReset();
    needsRehash.mockReset();
    needsRehash.mockReturnValue(false);
    hashPassword.mockReset();
    createSession.mockReset();
  });

  it("bloquea una cuenta con email sin verificar, aunque la contraseña sea correcta", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", passwordHash: "hash", emailVerified: false });
    verifyPasswordConstantTime.mockResolvedValue(true);
    const { login } = await import("../src/app/login/actions");
    const result = await login({}, formData({ email: "ana@example.com", password: "correcta" }));
    expect(result).toEqual({ error: "Todavía no has confirmado tu email.", sinVerificar: true });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("deja entrar a una cuenta verificada con la contraseña correcta", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", passwordHash: "hash", emailVerified: true });
    verifyPasswordConstantTime.mockResolvedValue(true);
    const { login } = await import("../src/app/login/actions");
    await expect(login({}, formData({ email: "ana@example.com", password: "correcta" }))).rejects.toThrow(
      `${REDIRECT_MARK}:/`,
    );
    expect(createSession).toHaveBeenCalledWith("u1");
  });

  it("contraseña incorrecta no revela si la cuenta existe", async () => {
    userFindUnique.mockResolvedValue(null);
    verifyPasswordConstantTime.mockResolvedValue(false);
    const { login } = await import("../src/app/login/actions");
    const result = await login({}, formData({ email: "nadie@example.com", password: "loquesea" }));
    expect(result).toEqual({ error: "Email o contraseña incorrectos." });
  });
});

describe("resendVerification", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    userFindUnique.mockReset();
    createVerificationToken.mockReset();
    createVerificationToken.mockResolvedValue("token123");
    sendVerificationEmail.mockReset();
    sendVerificationEmail.mockResolvedValue(true);
    resolveBaseUrl.mockReset();
    resolveBaseUrl.mockResolvedValue("http://localhost:3000");
  });

  it("reenvía el correo si la cuenta existe y no está verificada", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: false });
    const { resendVerification } = await import("../src/app/login/actions");
    const result = await resendVerification({}, formData({ email: "ana@example.com" }));
    expect(createVerificationToken).toHaveBeenCalledWith("u1");
    expect(sendVerificationEmail).toHaveBeenCalled();
    expect(result).toEqual({ sent: true });
  });

  it("responde 'sent: true' igual aunque la cuenta no exista (no revela nada)", async () => {
    userFindUnique.mockResolvedValue(null);
    const { resendVerification } = await import("../src/app/login/actions");
    const result = await resendVerification({}, formData({ email: "nadie@example.com" }));
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: true });
  });

  it("no reenvía si la cuenta ya está verificada", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: true });
    const { resendVerification } = await import("../src/app/login/actions");
    await resendVerification({}, formData({ email: "ana@example.com" }));
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
