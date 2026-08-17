import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const hashPassword = vi.fn();
const verifyPassword = vi.fn();
vi.mock("@/lib/auth", () => ({
  generateLinkCode: vi.fn(),
  hashPassword: (...args: unknown[]) => hashPassword(...args),
  verifyPassword: (...args: unknown[]) => verifyPassword(...args),
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 72,
}));

// Cambiar la contraseña echa de las demás sesiones y emite una nueva para
// este dispositivo (ver sessionRevocation.ts) — sin mockear esto, firmar el
// JWT fallaría por falta de secreto en el entorno de test.
const createSession = vi.fn();
vi.mock("@/lib/session", () => ({ createSession: (...args: unknown[]) => createSession(...args) }));

const revokeAllSessions = vi.fn();
vi.mock("@/lib/sessionRevocation", () => ({
  revokeAllSessions: (...args: unknown[]) => revokeAllSessions(...args),
}));

const userFindUniqueOrThrow = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: (...args: unknown[]) => userFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

beforeEach(() => {
  hashPassword.mockReset();
  hashPassword.mockResolvedValue("hashed-nueva");
  verifyPassword.mockReset();
  userFindUniqueOrThrow.mockReset();
  userUpdate.mockReset();
  userUpdate.mockResolvedValue({});
  createSession.mockReset();
  createSession.mockResolvedValue(undefined);
  revokeAllSessions.mockReset();
  revokeAllSessions.mockResolvedValue(undefined);
});

describe("changePassword", () => {
  it("rechaza una contraseña nueva demasiado corta", async () => {
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await changePassword("actual", "corta", "corta");
    expect(result.error).toMatch(/al menos 8 caracteres/);
    expect(userFindUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña nueva demasiado larga", async () => {
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    const larga = "a".repeat(73);
    const result = await changePassword("actual", larga, larga);
    expect(result.error).toMatch(/no puede tener más de 72/);
  });

  it("rechaza si la confirmación no coincide", async () => {
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await changePassword("actual", "nuevaClave1", "otraClave2");
    expect(result.error).toMatch(/no coinciden/);
    expect(userFindUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("con cuenta que ya tiene contraseña, rechaza si la actual no coincide", async () => {
    userFindUniqueOrThrow.mockResolvedValue({ passwordHash: "hash-actual" });
    verifyPassword.mockResolvedValue(false);
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await changePassword("mala", "nuevaClave1", "nuevaClave1");
    expect(result.error).toMatch(/no es correcta/);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("con cuenta que ya tiene contraseña, la cambia si la actual es correcta", async () => {
    userFindUniqueOrThrow.mockResolvedValue({ passwordHash: "hash-actual" });
    verifyPassword.mockResolvedValue(true);
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await changePassword("buena", "nuevaClave1", "nuevaClave1");
    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed-nueva", sessionsValidFrom: expect.any(Date) },
    });
  });

  it("cambiar la contraseña echa de las DEMÁS sesiones, pero no de la de este dispositivo", async () => {
    // Es justo lo que espera quien cambia la contraseña porque cree que
    // alguien más ha entrado: el resto de sesiones caen (sessionsValidFrom)
    // y a él se le emite una nueva para no tener que volver a entrar.
    userFindUniqueOrThrow.mockResolvedValue({ passwordHash: "hash-actual" });
    verifyPassword.mockResolvedValue(true);
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    await changePassword("buena", "nuevaClave1", "nuevaClave1");

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sessionsValidFrom: expect.any(Date) }) }),
    );
    expect(createSession).toHaveBeenCalledWith("u1");
  });

  it("si la contraseña actual no es correcta, NO revoca ninguna sesión", async () => {
    userFindUniqueOrThrow.mockResolvedValue({ passwordHash: "hash-actual" });
    verifyPassword.mockResolvedValue(false);
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    await changePassword("mala", "nuevaClave1", "nuevaClave1");

    expect(userUpdate).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("con cuenta sin contraseña (solo Google), no exige la actual y la añade directamente", async () => {
    userFindUniqueOrThrow.mockResolvedValue({ passwordHash: null });
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await changePassword("", "nuevaClave1", "nuevaClave1");
    expect(result.ok).toBe(true);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed-nueva", sessionsValidFrom: expect.any(Date) },
    });
  });
});

describe("closeOtherSessions", () => {
  it("revoca todo y emite una sesión nueva para el dispositivo actual", async () => {
    const { closeOtherSessions } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await closeOtherSessions();

    expect(result.ok).toBe(true);
    expect(revokeAllSessions).toHaveBeenCalledWith("u1");
    expect(createSession).toHaveBeenCalledWith("u1");
  });

  it("informa del fallo sin romper si la revocación no se puede guardar", async () => {
    revokeAllSessions.mockRejectedValue(new Error("ECONNREFUSED"));
    const { closeOtherSessions } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await closeOtherSessions();

    expect(result.error).toMatch(/No se ha podido completar/);
    expect(createSession).not.toHaveBeenCalled();
  });
});
