import { describe, expect, it } from "vitest";
import { titleFromQuestion } from "../src/lib/conversationTitle";

describe("titleFromQuestion", () => {
  it("usa la pregunta tal cual si cabe entera", () => {
    expect(titleFromQuestion("¿Qué tengo pendiente?")).toBe("¿Qué tengo pendiente?");
  });

  it("recorta con puntos suspensivos si es muy larga", () => {
    const larga = "a".repeat(80);
    const titulo = titleFromQuestion(larga);
    expect(titulo.length).toBe(60);
    expect(titulo.endsWith("…")).toBe(true);
  });

  it("quita espacios sobrantes", () => {
    expect(titleFromQuestion("   hola   ")).toBe("hola");
  });

  it("cae a un título genérico si la pregunta está vacía o en blanco", () => {
    expect(titleFromQuestion("")).toBe("Nueva conversación");
    expect(titleFromQuestion("   ")).toBe("Nueva conversación");
  });
});
