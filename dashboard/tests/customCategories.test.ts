import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const customCategoryFindMany = vi.fn();
const customCategoryFindFirst = vi.fn();
const customCategoryCreate = vi.fn();
const customCategoryDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customCategory: {
      findMany: (...args: unknown[]) => customCategoryFindMany(...args),
      findFirst: (...args: unknown[]) => customCategoryFindFirst(...args),
      create: (...args: unknown[]) => customCategoryCreate(...args),
      deleteMany: (...args: unknown[]) => customCategoryDeleteMany(...args),
    },
  },
}));

beforeEach(() => {
  customCategoryFindMany.mockReset();
  customCategoryFindFirst.mockReset();
  customCategoryCreate.mockReset();
  customCategoryDeleteMany.mockReset();
});

describe("listCustomCategories", () => {
  it("pide las categorías del usuario dado, más antigua primero", async () => {
    customCategoryFindMany.mockResolvedValue([{ id: "c1", nombre: "Recetas", emoji: "🍳" }]);
    const { listCustomCategories } = await import("../src/lib/customCategories");

    const result = await listCustomCategories("u1");

    expect(customCategoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, orderBy: { createdAt: "asc" } }),
    );
    expect(result).toEqual([{ id: "c1", nombre: "Recetas", emoji: "🍳" }]);
  });
});

describe("findOwnCustomCategory", () => {
  it("filtra por id Y por dueño a la vez — una FK no basta para saber de quién es", async () => {
    customCategoryFindFirst.mockResolvedValue(null);
    const { findOwnCustomCategory } = await import("../src/lib/customCategories");

    const result = await findOwnCustomCategory("u1", "cc-ajena");

    expect(customCategoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cc-ajena", userId: "u1" } }),
    );
    expect(result).toBeNull();
  });
});

describe("createCustomCategory", () => {
  it("rechaza un nombre vacío sin tocar la base de datos", async () => {
    const { createCustomCategory } = await import("../src/lib/customCategories");
    const result = await createCustomCategory("u1", "   ", "");
    expect(result.error).toMatch(/ponle un nombre/i);
    expect(customCategoryCreate).not.toHaveBeenCalled();
  });

  it("crea la categoría y devuelve el registro con su id real", async () => {
    customCategoryCreate.mockResolvedValue({ id: "c1", nombre: "Recetas", emoji: "🍳" });
    const { createCustomCategory } = await import("../src/lib/customCategories");

    const result = await createCustomCategory("u1", "  Recetas  ", "🍳");

    expect(customCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "u1", nombre: "Recetas", emoji: "🍳" } }),
    );
    expect(result.categoria).toEqual({ id: "c1", nombre: "Recetas", emoji: "🍳" });
  });

  it("un nombre duplicado da un mensaje claro, no el error crudo de Postgres", async () => {
    customCategoryCreate.mockRejectedValue(new Error("Unique constraint failed on the fields: (`userId`,`nombre`)"));
    const { createCustomCategory } = await import("../src/lib/customCategories");

    const result = await createCustomCategory("u1", "Recetas", "");

    expect(result.error).toMatch(/ya tienes una categoría con ese nombre/i);
  });
});

describe("deleteCustomCategory", () => {
  it("borra filtrando por dueño", async () => {
    customCategoryDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteCustomCategory } = await import("../src/lib/customCategories");

    const result = await deleteCustomCategory("u1", "c1");

    expect(customCategoryDeleteMany).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1" } });
    expect(result.error).toBeUndefined();
  });

  it("con un id ajeno o inventado dice que no existe, sin filtrar de quién era", async () => {
    customCategoryDeleteMany.mockResolvedValue({ count: 0 });
    const { deleteCustomCategory } = await import("../src/lib/customCategories");

    const result = await deleteCustomCategory("u1", "c-ajena");

    expect(result.error).toMatch(/no existe/i);
  });
});
