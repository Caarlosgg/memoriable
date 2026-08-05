import { describe, expect, it, vi } from "vitest";
import type { Message } from "@prisma/client";
import { hybridSearch, mergeHybridResults } from "../src/lib/hybridSearch";
import type { Embedder } from "../src/lib/botPipeline/types";

function fakeMessage(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    tipo: "text",
    contenido: `contenido ${id}`,
    categoria: "nota",
    resumen: `resumen ${id}`,
    hecho: false,
    estado: "POR_HACER",
    prioridad: "MEDIA",
    etiquetas: [],
    camposExtra: {},
    fecha: new Date("2026-08-01T00:00:00.000Z"),
    userId: "u1",
    ...overrides,
  };
}

function stubEmbedder(vector: number[] | null): Embedder {
  return {
    embedDocument: vi.fn().mockResolvedValue(vector),
    embedQuery: vi.fn().mockResolvedValue(vector),
  };
}

describe("mergeHybridResults", () => {
  it("pone los resultados de texto primero, en su propio orden", () => {
    const text = [fakeMessage("t1"), fakeMessage("t2")];
    const semantic = [fakeMessage("s1")];

    const merged = mergeHybridResults(text, semantic, 10);

    expect(merged.map((m) => m.id)).toEqual(["t1", "t2", "s1"]);
  });

  it("no duplica un id que ya viene de texto", () => {
    const text = [fakeMessage("a")];
    const semantic = [fakeMessage("a"), fakeMessage("b")];

    const merged = mergeHybridResults(text, semantic, 10);

    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("respeta el límite total tras la mezcla", () => {
    const text = [fakeMessage("t1")];
    const semantic = [fakeMessage("s1"), fakeMessage("s2"), fakeMessage("s3")];

    const merged = mergeHybridResults(text, semantic, 2);

    expect(merged.map((m) => m.id)).toEqual(["t1", "s1"]);
  });

  it("no incluye semántica si el texto ya llenó el límite", () => {
    const text = [fakeMessage("t1"), fakeMessage("t2")];
    const semantic = [fakeMessage("s1")];

    const merged = mergeHybridResults(text, semantic, 2);

    expect(merged.map((m) => m.id)).toEqual(["t1", "t2"]);
  });
});

describe("hybridSearch", () => {
  it("no llama a la búsqueda semántica si el texto ya llena el límite", async () => {
    const textSearch = vi.fn().mockResolvedValue([fakeMessage("t1"), fakeMessage("t2")]);
    const findSimilar = vi.fn();
    const embedder = stubEmbedder([0.1]);

    const result = await hybridSearch("pan", {}, 2, { textSearch, embedder, findSimilar });

    expect(result.map((m) => m.id)).toEqual(["t1", "t2"]);
    expect(embedder.embedQuery).not.toHaveBeenCalled();
    expect(findSimilar).not.toHaveBeenCalled();
  });

  it("completa con semántica cuando el texto se queda corto", async () => {
    const textSearch = vi.fn().mockResolvedValue([fakeMessage("t1")]);
    const findSimilar = vi.fn().mockResolvedValue([fakeMessage("s1"), fakeMessage("s2")]);
    const embedder = stubEmbedder([0.1, 0.2]);

    const result = await hybridSearch("pan", {}, 3, { textSearch, embedder, findSimilar });

    expect(result.map((m) => m.id)).toEqual(["t1", "s1", "s2"]);
    expect(embedder.embedQuery).toHaveBeenCalledWith("pan");
    expect(findSimilar).toHaveBeenCalledWith([0.1, 0.2], { limit: 2 });
  });

  it("pasa los filtros (categoría, estado, prioridad, fechas) a ambas búsquedas", async () => {
    const textSearch = vi.fn().mockResolvedValue([]);
    const findSimilar = vi.fn().mockResolvedValue([]);
    const embedder = stubEmbedder([0.1]);
    const desde = new Date("2026-08-01T00:00:00.000Z");
    const hasta = new Date("2026-08-05T23:59:59.999Z");

    await hybridSearch("pan", { categoria: "tarea", estado: "EN_PROGRESO", prioridad: "ALTA", desde, hasta }, 5, {
      textSearch,
      embedder,
      findSimilar,
    });

    const filters = { categoria: "tarea", estado: "EN_PROGRESO", prioridad: "ALTA", desde, hasta };
    expect(textSearch).toHaveBeenCalledWith("pan", filters, 5);
    expect(findSimilar).toHaveBeenCalledWith([0.1], { ...filters, limit: 5 });
  });

  it("se queda solo con texto si el embedder no puede generar el vector (sin GEMINI_API_KEY o fallo)", async () => {
    const textSearch = vi.fn().mockResolvedValue([fakeMessage("t1")]);
    const findSimilar = vi.fn();
    const embedder = stubEmbedder(null);

    const result = await hybridSearch("pan", {}, 5, { textSearch, embedder, findSimilar });

    expect(result.map((m) => m.id)).toEqual(["t1"]);
    expect(findSimilar).not.toHaveBeenCalled();
  });

  it("devuelve vacío sin llamar a nada si la consulta está vacía", async () => {
    const textSearch = vi.fn();
    const findSimilar = vi.fn();
    const embedder = stubEmbedder([0.1]);

    const result = await hybridSearch("   ", {}, 5, { textSearch, embedder, findSimilar });

    expect(result).toEqual([]);
    expect(textSearch).not.toHaveBeenCalled();
  });
});
