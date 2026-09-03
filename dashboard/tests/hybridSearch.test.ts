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
    imagenes: [],
    orden: 0,
    workspaceId: "ws1",
    assigneeId: null,
    camposExtra: {},
    checklist: [],
    fecha: new Date("2026-08-01T00:00:00.000Z"),
    fechaLimite: null,
    boardStatusId: null,
    customCategoryId: null,
    enProgresoPorId: null,
    enProgresoDesde: null,
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
  it("con igualdad de puestos, el texto va primero: una certeza pesa más que una conjetura", () => {
    const text = [fakeMessage("t1"), fakeMessage("t2")];
    const semantic = [fakeMessage("s1")];

    const merged = mergeHybridResults(text, semantic, 10);

    expect(merged.map((m) => m.id)).toEqual(["t1", "t2", "s1"]);
  });

  it("una nota que sale en LAS DOS listas sube: es la señal más fuerte que hay", () => {
    // Coincide literalmente Y por significado. Antes no ganaba nada por
    // ello — simplemente se deduplicaba y se quedaba donde estaba.
    const text = [fakeMessage("a"), fakeMessage("b")];
    const semantic = [fakeMessage("b"), fakeMessage("c")];

    const merged = mergeHybridResults(text, semantic, 10);

    expect(merged[0]!.id).toBe("b");
  });

  it("no duplica un id que viene de las dos listas", () => {
    const text = [fakeMessage("a")];
    const semantic = [fakeMessage("a"), fakeMessage("b")];

    const merged = mergeHybridResults(text, semantic, 10);

    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("el 1º por significado adelanta a los últimos de texto, pero nunca a los primeros", () => {
    // El caso que antes era IMPOSIBLE: lo semántico solo rellenaba huecos
    // al final, nunca podía reordenar. Y el límite del otro lado importa
    // igual: una conjetura no debe desbancar a la mejor coincidencia
    // literal.
    const text = Array.from({ length: 10 }, (_, i) => fakeMessage(`t${i}`));
    const semantic = [fakeMessage("s1")];

    const ids = mergeHybridResults(text, semantic, 20).map((m) => m.id);

    expect(ids.indexOf("s1")).toBeGreaterThan(ids.indexOf("t0"));
    expect(ids.indexOf("s1")).toBeLessThan(ids.indexOf("t9"));
  });

  it("respeta el límite total tras la mezcla", () => {
    const text = [fakeMessage("t1")];
    const semantic = [fakeMessage("s1"), fakeMessage("s2"), fakeMessage("s3")];

    const merged = mergeHybridResults(text, semantic, 2);

    expect(merged).toHaveLength(2);
    expect(merged[0]!.id).toBe("t1");
  });
});

describe("hybridSearch", () => {
  it("ejecuta la semántica AUNQUE el texto llene el límite — el caso donde más falta hace", async () => {
    // Antes se saltaba: si 15 notas contenían la palabra literal, la
    // semántica no corría nunca, justo cuando lo que sobra es ruido y lo
    // que hace falta es ordenar por sentido.
    const textSearch = vi.fn().mockResolvedValue([fakeMessage("t1"), fakeMessage("t2")]);
    const findSimilar = vi.fn().mockResolvedValue([fakeMessage("t2")]);
    const embedder = stubEmbedder([0.1]);

    await hybridSearch("pan", {}, 2, { textSearch, embedder, findSimilar });

    expect(embedder.embedQuery).toHaveBeenCalled();
    expect(findSimilar).toHaveBeenCalled();
  });

  it("fusiona texto y semántica por relevancia", async () => {
    const textSearch = vi.fn().mockResolvedValue([fakeMessage("t1")]);
    const findSimilar = vi.fn().mockResolvedValue([fakeMessage("s1"), fakeMessage("s2")]);
    const embedder = stubEmbedder([0.1, 0.2]);

    const result = await hybridSearch("pan", {}, 3, { textSearch, embedder, findSimilar });

    expect(result.map((m) => m.id)).toEqual(["t1", "s1", "s2"]);
    expect(embedder.embedQuery).toHaveBeenCalledWith("pan");
    // El límite ENTERO, no "los que falten": con RRF, un semántico puede
    // adelantar a uno de texto, así que hace falta la lista completa.
    expect(findSimilar).toHaveBeenCalledWith([0.1, 0.2], { limit: 3 });
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

  it("si la mitad semántica revienta, la de texto sigue respondiendo", async () => {
    const textSearch = vi.fn().mockResolvedValue([fakeMessage("t1")]);
    const findSimilar = vi.fn().mockRejectedValue(new Error("pgvector caído"));
    const embedder = stubEmbedder([0.1]);

    const result = await hybridSearch("pan", {}, 5, { textSearch, embedder, findSimilar });

    expect(result.map((m) => m.id)).toEqual(["t1"]);
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
