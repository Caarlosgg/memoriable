import { describe, expect, it, vi, beforeEach } from "vitest";

const messageUpdateMany = vi.fn();
const messageFindFirst = vi.fn();
const customCategoryFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      updateMany: (...a: unknown[]) => messageUpdateMany(...a),
      findFirst: (...a: unknown[]) => messageFindFirst(...a),
    },
    customCategory: {
      findFirst: (...a: unknown[]) => customCategoryFindFirst(...a),
    },
  },
}));

beforeEach(() => {
  messageUpdateMany.mockReset();
  messageFindFirst.mockReset();
  customCategoryFindFirst.mockReset();
});

/**
 * `DashboardMessageRepository` no tiene uso real hoy (captureMessage solo
 * llama a `save`; el dashboard marca hecho/recategoriza por su propia vía
 * — updateTaskStatus, MessageDetailDialog), pero implementa el contrato
 * completo de MessageRepository compartido con el bot (Fase 3 del
 * roadmap: botones inline en Telegram) — se prueba igual, para que una
 * implementación a medias no se cuele sin que nadie lo note.
 */
describe("DashboardMessageRepository.markDone", () => {
  it("pone hecho Y estado a la vez, filtrando por dueño", async () => {
    messageUpdateMany.mockResolvedValue({ count: 1 });
    messageFindFirst.mockResolvedValue({
      id: "m1",
      tipo: "text",
      contenido: "x",
      categoria: "tarea",
      resumen: "x",
      hecho: true,
      fecha: new Date(),
      userId: "u1",
    });
    const { DashboardMessageRepository } = await import("../src/lib/pipeline");
    const repo = new DashboardMessageRepository("ws1");

    const result = await repo.markDone("u1", "m1");

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: { hecho: true, estado: "HECHO" },
    });
    expect(result?.hecho).toBe(true);
  });

  it("con un id ajeno o inventado no toca nada y devuelve null", async () => {
    messageUpdateMany.mockResolvedValue({ count: 0 });
    const { DashboardMessageRepository } = await import("../src/lib/pipeline");
    const repo = new DashboardMessageRepository("ws1");

    await expect(repo.markDone("u1", "ajeno")).resolves.toBeNull();
    expect(messageFindFirst).not.toHaveBeenCalled();
  });
});

describe("DashboardMessageRepository.recategorize", () => {
  it("cambia solo la categoría, filtrando por dueño", async () => {
    messageUpdateMany.mockResolvedValue({ count: 1 });
    messageFindFirst.mockResolvedValue({
      id: "m1",
      tipo: "text",
      contenido: "x",
      categoria: "idea",
      resumen: "x",
      hecho: false,
      fecha: new Date(),
      userId: "u1",
    });
    const { DashboardMessageRepository } = await import("../src/lib/pipeline");
    const repo = new DashboardMessageRepository("ws1");

    const result = await repo.recategorize("u1", "m1", "idea");

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: { categoria: "idea" },
    });
    expect(result?.categoria).toBe("idea");
  });

  it("con un id ajeno o inventado no toca nada y devuelve null", async () => {
    messageUpdateMany.mockResolvedValue({ count: 0 });
    const { DashboardMessageRepository } = await import("../src/lib/pipeline");
    const repo = new DashboardMessageRepository("ws1");

    await expect(repo.recategorize("u2", "m1", "tarea")).resolves.toBeNull();
    expect(messageFindFirst).not.toHaveBeenCalled();
  });
});

describe("DashboardMessageRepository.setCustomCategory", () => {
  it("verifica que la categoría propia sea de ESTE usuario ANTES de escribir", async () => {
    // La clave foránea de Postgres solo garantiza que la fila exista, no
    // que sea de este usuario — sin esta comprobación, se podría enseñar
    // el nombre de la categoría propia de OTRO usuario.
    customCategoryFindFirst.mockResolvedValue(null);
    const { DashboardMessageRepository } = await import("../src/lib/pipeline");
    const repo = new DashboardMessageRepository("ws1");

    const result = await repo.setCustomCategory("u1", "m1", "cc-ajena");

    expect(customCategoryFindFirst).toHaveBeenCalledWith({ where: { id: "cc-ajena", userId: "u1" } });
    expect(messageUpdateMany).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("con una categoría propia de verdad, actualiza SOLO customCategoryId", async () => {
    customCategoryFindFirst.mockResolvedValue({ id: "cc1" });
    messageUpdateMany.mockResolvedValue({ count: 1 });
    messageFindFirst.mockResolvedValue({
      id: "m1",
      tipo: "text",
      contenido: "x",
      categoria: "nota",
      resumen: "x",
      hecho: false,
      fecha: new Date(),
      userId: "u1",
      customCategoryId: "cc1",
    });
    const { DashboardMessageRepository } = await import("../src/lib/pipeline");
    const repo = new DashboardMessageRepository("ws1");

    const result = await repo.setCustomCategory("u1", "m1", "cc1");

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: { customCategoryId: "cc1" },
    });
    expect(result?.customCategoryId).toBe("cc1");
  });

  it("con null, quita la etiqueta sin comprobar propiedad", async () => {
    messageUpdateMany.mockResolvedValue({ count: 1 });
    messageFindFirst.mockResolvedValue({
      id: "m1",
      tipo: "text",
      contenido: "x",
      categoria: "nota",
      resumen: "x",
      hecho: false,
      fecha: new Date(),
      userId: "u1",
      customCategoryId: null,
    });
    const { DashboardMessageRepository } = await import("../src/lib/pipeline");
    const repo = new DashboardMessageRepository("ws1");

    const result = await repo.setCustomCategory("u1", "m1", null);

    expect(customCategoryFindFirst).not.toHaveBeenCalled();
    expect(result?.customCategoryId).toBeNull();
  });
});
