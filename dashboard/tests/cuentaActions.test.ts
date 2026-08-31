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
const customCategoryFindMany = vi.fn();
const customCategoryCreate = vi.fn();
const customCategoryDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: (...args: unknown[]) => userFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    customCategory: {
      findMany: (...args: unknown[]) => customCategoryFindMany(...args),
      create: (...args: unknown[]) => customCategoryCreate(...args),
      deleteMany: (...args: unknown[]) => customCategoryDeleteMany(...args),
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
  customCategoryFindMany.mockReset();
  customCategoryCreate.mockReset();
  customCategoryDeleteMany.mockReset();
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

describe("listCustomCategories", () => {
  it("pide las categorías del usuario de la sesión, más antigua primero", async () => {
    customCategoryFindMany.mockResolvedValue([{ id: "c1", nombre: "Recetas", emoji: "🍳" }]);
    const { listCustomCategories } = await import("../src/app/(dashboard)/cuenta/actions");

    const result = await listCustomCategories();

    expect(customCategoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, orderBy: { createdAt: "asc" } }),
    );
    expect(result).toEqual([{ id: "c1", nombre: "Recetas", emoji: "🍳" }]);
  });
});

describe("createCustomCategory", () => {
  it("rechaza un nombre vacío sin tocar la base de datos", async () => {
    const { createCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await createCustomCategory("   ", "");

    expect(result.error).toMatch(/ponle un nombre/i);
    expect(customCategoryCreate).not.toHaveBeenCalled();
  });

  it("rechaza un nombre demasiado largo", async () => {
    const { createCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await createCustomCategory("x".repeat(31), "");

    expect(result.error).toMatch(/no puede tener más de 30/i);
    expect(customCategoryCreate).not.toHaveBeenCalled();
  });

  it("rechaza claramente más de un emoji", async () => {
    const { createCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");
    // 5 emoji sueltos = 5 code points, por encima del límite de 4.
    const result = await createCustomCategory("Cosas", "🍳🎯🍳🎯🍳");

    expect(result.error).toMatch(/un solo emoji/i);
    expect(customCategoryCreate).not.toHaveBeenCalled();
  });

  it("un emoji normal de dos code points (🍳, por el par subrogado UTF-16) no se rechaza contándolo por .length", async () => {
    // `.length` de "🍳" es 2 (par subrogado) — si el límite se comparara
    // contra `.length` en vez de contra el iterador por code point, un
    // emoji normal y corriente ya se rechazaría como "demasiado largo".
    customCategoryCreate.mockResolvedValue({ id: "c1", nombre: "Recetas", emoji: "🍳" });
    const { createCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");

    const result = await createCustomCategory("Recetas", "🍳");

    expect("🍳".length).toBe(2);
    expect([..."🍳"].length).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("crea la categoría y devuelve el registro con su id real", async () => {
    customCategoryCreate.mockResolvedValue({ id: "c1", nombre: "Recetas", emoji: "🍳" });
    const { createCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");

    const result = await createCustomCategory("  Recetas  ", "🍳");

    expect(customCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "u1", nombre: "Recetas", emoji: "🍳" } }),
    );
    expect(result.categoria).toEqual({ id: "c1", nombre: "Recetas", emoji: "🍳" });
  });

  it("un nombre duplicado da un mensaje claro, no el error crudo de Postgres", async () => {
    customCategoryCreate.mockRejectedValue(new Error("Unique constraint failed on the fields: (`userId`,`nombre`)"));
    const { createCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");

    const result = await createCustomCategory("Recetas", "");

    expect(result.error).toMatch(/ya tienes una categoría con ese nombre/i);
  });
});

describe("deleteCustomCategory", () => {
  it("borra filtrando por dueño", async () => {
    customCategoryDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");

    const result = await deleteCustomCategory("c1");

    expect(customCategoryDeleteMany).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1" } });
    expect(result.error).toBeUndefined();
  });

  it("con un id ajeno o inventado dice que no existe, sin filtrar de quién era", async () => {
    customCategoryDeleteMany.mockResolvedValue({ count: 0 });
    const { deleteCustomCategory } = await import("../src/app/(dashboard)/cuenta/actions");

    const result = await deleteCustomCategory("c-ajena");

    expect(result.error).toMatch(/no existe/i);
  });
});
