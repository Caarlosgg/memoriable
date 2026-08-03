import { describe, expect, it } from "vitest";
import type { Message } from "@prisma/client";
import { buildContextBlock, buildSystemPrompt, toAssistantSources } from "../src/lib/assistantContext";

function fakeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    tipo: "text",
    contenido: "Recuérdame pedir la matrícula del curso de IA",
    categoria: "recordatorio",
    resumen: "Pedir la matrícula del curso de IA",
    hecho: false,
    fecha: new Date("2026-07-28T21:24:00.000Z"),
    ...overrides,
  };
}

describe("toAssistantSources", () => {
  it("mapea categoría a emoji/etiqueta y formatea la fecha", () => {
    const [source] = toAssistantSources([fakeMessage()]);

    expect(source).toMatchObject({
      id: "m1",
      categoria: "recordatorio",
      label: "Recordatorios",
      resumen: "Pedir la matrícula del curso de IA",
      contenido: "Recuérdame pedir la matrícula del curso de IA",
    });
    expect(source!.emoji).toBeTruthy();
    expect(source!.fecha).toContain("2026");
  });

  it("degrada a la presentación de 'otro' ante una categoría desconocida", () => {
    const [source] = toAssistantSources([fakeMessage({ categoria: "marciano" })]);
    expect(source!.label).toBe("Sin categorizar");
  });

  it("devuelve un array vacío si no hay mensajes", () => {
    expect(toAssistantSources([])).toEqual([]);
  });
});

describe("buildContextBlock", () => {
  it("dice honestamente que no hay nada cuando la lista está vacía (nunca inventa)", () => {
    const block = buildContextBlock([]);
    expect(block).toMatch(/no se ha encontrado/i);
  });

  it("incluye categoría, fecha, resumen y contenido de cada fuente, numeradas", () => {
    const sources = toAssistantSources([
      fakeMessage({ id: "a", resumen: "Resumen A" }),
      fakeMessage({ id: "b", resumen: "Resumen B", categoria: "idea" }),
    ]);

    const block = buildContextBlock(sources);

    expect(block).toContain("[1]");
    expect(block).toContain("[2]");
    expect(block).toContain("Resumen A");
    expect(block).toContain("Resumen B");
    expect(block).toContain("Recordatorios");
    expect(block).toContain("Ideas");
  });
});

describe("buildSystemPrompt", () => {
  it("incluye la regla de no inventar y el bloque de contexto recibido", () => {
    const prompt = buildSystemPrompt("CONTEXTO DE PRUEBA");

    expect(prompt).toContain("Nunca inventes");
    expect(prompt).toContain("CONTEXTO DE PRUEBA");
  });

  it("pide citar por categoría/fecha, no por ids internos", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt.toLowerCase()).toContain("ids internos");
  });
});
