import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Message } from "@prisma/client";

const messageFindMany = vi.fn();
const messageCount = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findMany: (...args: unknown[]) => messageFindMany(...args),
      count: (...args: unknown[]) => messageCount(...args),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const embedQuery = vi.fn();
vi.mock("@/lib/pipeline", () => ({
  resolveEmbedder: () => ({ embedQuery, embedDocument: vi.fn() }),
}));

const findSimilarMessages = vi.fn();
vi.mock("@/lib/vectorSearch", () => ({
  findSimilarMessages: (...args: unknown[]) => findSimilarMessages(...args),
}));

function fakeMessage(id: string): Message {
  return { id } as Message;
}

beforeEach(() => {
  messageFindMany.mockReset();
  messageCount.mockReset();
  embedQuery.mockReset();
  embedQuery.mockResolvedValue(null);
  findSimilarMessages.mockReset();
  findSimilarMessages.mockResolvedValue([]);
});

describe("searchMessages — solo filtros (sin texto)", () => {
  it("da un total EXACTO: filtrar es una pregunta con respuesta exacta", async () => {
    messageFindMany.mockResolvedValue([fakeMessage("a"), fakeMessage("b")]);
    messageCount.mockResolvedValue(87);
    const { searchMessages } = await import("@/lib/data");

    const res = await searchMessages("ws1", "", { categoria: "tarea" }, 2);

    expect(res.total).toBe(87);
    expect(res.hayMas).toBe(true);
  });

  it("cuando caben todos, no dice que haya más", async () => {
    messageFindMany.mockResolvedValue([fakeMessage("a")]);
    messageCount.mockResolvedValue(1);
    const { searchMessages } = await import("@/lib/data");

    const res = await searchMessages("ws1", "", { categoria: "tarea" }, 15);

    expect(res.hayMas).toBe(false);
  });

  it("sin texto y sin filtros no consulta nada: esa vista ya la cubre la agrupada", async () => {
    const { searchMessages } = await import("@/lib/data");

    const res = await searchMessages("ws1", "", {}, 15);

    expect(res).toEqual({ messages: [], hayMas: false });
    expect(messageFindMany).not.toHaveBeenCalled();
  });

  it("respeta el tope absoluto para que nadie pida 100.000 filas por URL", async () => {
    messageFindMany.mockResolvedValue([]);
    messageCount.mockResolvedValue(0);
    const { searchMessages } = await import("@/lib/data");

    await searchMessages("ws1", "", { categoria: "tarea" }, 99999);

    expect(messageFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  });
});

describe("searchMessages — con texto", () => {
  it("NO inventa un total: en una búsqueda por relevancia ese número no existe", async () => {
    // La mitad semántica siempre puede devolver una nota un poco menos
    // parecida que la anterior, así que "hay 240 resultados" sería mentira.
    messageFindMany.mockResolvedValue([fakeMessage("a")]);
    const { searchMessages } = await import("@/lib/data");

    const res = await searchMessages("pan", "pan", {}, 15);

    expect(res.total).toBeUndefined();
    expect(messageCount).not.toHaveBeenCalled();
  });

  it("detecta que hay más pidiendo uno de más, sin un count aparte", async () => {
    // 16 devueltos para un límite de 15 → queda al menos uno fuera.
    messageFindMany.mockResolvedValue(Array.from({ length: 16 }, (_, i) => fakeMessage(`t${i}`)));
    const { searchMessages } = await import("@/lib/data");

    const res = await searchMessages("ws1", "pan", {}, 15);

    expect(res.messages).toHaveLength(15);
    expect(res.hayMas).toBe(true);
  });

  it("si caben justos, no ofrece más", async () => {
    messageFindMany.mockResolvedValue(Array.from({ length: 15 }, (_, i) => fakeMessage(`t${i}`)));
    const { searchMessages } = await import("@/lib/data");

    const res = await searchMessages("ws1", "pan", {}, 15);

    expect(res.messages).toHaveLength(15);
    expect(res.hayMas).toBe(false);
  });
});
