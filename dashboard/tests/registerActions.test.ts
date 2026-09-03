import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn(async () => "hashed"),
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 72,
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  clientIp: async () => "203.0.113.5",
}));

const userCreate = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { create: (...args: unknown[]) => userCreate(...args) },
    $transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
  },
}));

const createPersonalWorkspace = vi.fn();
vi.mock("@/lib/workspace", () => ({
  createPersonalWorkspace: (...args: unknown[]) => createPersonalWorkspace(...args),
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

/**
 * Formulario válido al que cada test le cambia SOLO lo que está probando —
 * así, cuando el registro gane otro campo obligatorio, no hay que tocar
 * ocho tests que no van de eso.
 */
function validForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    nombre: "Ana",
    email: "ana@example.com",
    password: "caldera8naranja",
    passwordConfirm: "caldera8naranja",
    acepta: "si",
    ...overrides,
  });
}

describe("register", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    userCreate.mockReset();
    userCreate.mockResolvedValue({ id: "u1", email: "ana@example.com" });
    transaction.mockReset();
    transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb({ user: { create: userCreate } }));
    createPersonalWorkspace.mockReset();
    createPersonalWorkspace.mockResolvedValue("ws1");
    createVerificationToken.mockReset();
    createVerificationToken.mockResolvedValue("token123");
    sendVerificationEmail.mockReset();
    sendVerificationEmail.mockResolvedValue(true);
    resolveBaseUrl.mockReset();
    resolveBaseUrl.mockResolvedValue("http://localhost:3000");
  });

  it("rechaza si las contraseñas no coinciden, sin tocar la base de datos", async () => {
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm({ passwordConfirm: "caldera8distinta" }),
    );
    expect(result.error).toMatch(/no coinciden/);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña que no cumple la política, sin tocar la base de datos", async () => {
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm({ password: "password1", passwordConfirm: "password1" }),
    );
    expect(result.error).toMatch(/demasiado común/);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña derivada del propio email (lo primero que probaría cualquiera)", async () => {
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm({ email: "benito@example.com", password: "benito12345", passwordConfirm: "benito12345" }),
    );
    expect(result.error).toMatch(/no puede parecerse a tu email/);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rechaza un email con formato inválido", async () => {
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm({ email: "no-es-un-email" }),
    );
    expect(result.error).toMatch(/email válido/);
  });

  it("crea la cuenta sin verificar, manda el correo de verificación, y NO inicia sesión automáticamente", async () => {
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm(),
    );

    expect(userCreate).toHaveBeenCalledWith({
      data: { email: "ana@example.com", nombre: "Ana", passwordHash: "hashed" },
    });
    expect(createPersonalWorkspace).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(createVerificationToken).toHaveBeenCalledWith("u1");
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "ana@example.com",
      "http://localhost:3000/verificar-email?token=token123",
    );
    expect(result).toEqual({ registered: true, emailSent: true });
  });

  it("la cuenta queda creada aunque falle el envío del correo de verificación, y lo refleja en emailSent", async () => {
    sendVerificationEmail.mockRejectedValue(new Error("SMTP caído"));
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm(),
    );
    expect(userCreate).toHaveBeenCalled();
    expect(result).toEqual({ registered: true, emailSent: false });
  });

  it("email duplicado da un mensaje claro, no un error genérico", async () => {
    userCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm(),
    );
    expect(result.error).toMatch(/ya existe una cuenta/i);
    expect(createVerificationToken).not.toHaveBeenCalled();
  });

  it("rechaza si no se aceptan los términos, aunque todo lo demás sea válido", async () => {
    const { register } = await import("../src/app/(auth)/registro/actions");
    // Una casilla sin marcar simplemente no viaja en el FormData — es el
    // caso real, no un valor "no".
    const fd = validForm();
    fd.delete("acepta");
    const result = await register({}, fd);
    expect(result.error).toMatch(/aceptar los términos/i);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rechaza un nombre vacío", async () => {
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register({}, validForm({ nombre: "   " }));
    expect(result.error).toMatch(/tu nombre/i);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("respeta el límite de intentos por IP", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const { register } = await import("../src/app/(auth)/registro/actions");
    const result = await register(
      {},
      validForm(),
    );
    expect(result.error).toMatch(/42s/);
    expect(userCreate).not.toHaveBeenCalled();
  });
});
