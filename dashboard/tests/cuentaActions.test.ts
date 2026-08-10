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
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "hashed-nueva" } });
  });

  it("con cuenta sin contraseña (solo Google), no exige la actual y la añade directamente", async () => {
    userFindUniqueOrThrow.mockResolvedValue({ passwordHash: null });
    const { changePassword } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await changePassword("", "nuevaClave1", "nuevaClave1");
    expect(result.ok).toBe(true);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "hashed-nueva" } });
  });
});
