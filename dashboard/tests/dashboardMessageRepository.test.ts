import { describe, expect, it, vi, beforeEach } from "vitest";

const messageUpdateMany = vi.fn();
const messageFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      updateMany: (...a: unknown[]) => messageUpdateMany(...a),
      findFirst: (...a: unknown[]) => messageFindFirst(...a),
    },
  },
}));

beforeEach(() => {
  messageUpdateMany.mockReset();
  messageFindFirst.mockReset();
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
