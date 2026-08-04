import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { isBlank } from "../src/components/AssistantMarkdown";

describe("isBlank", () => {
  it("es blank para null, undefined, booleanos y cadenas vacías/espacios", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(false)).toBe(true);
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
  });

  it("no es blank para texto real, incluso con espacios alrededor", () => {
    expect(isBlank("Llamar al banco")).toBe(false);
    expect(isBlank("  hola  ")).toBe(false);
  });

  it("recorre arrays de children: blank solo si todos lo son", () => {
    expect(isBlank([null, "", "   "])).toBe(true);
    expect(isBlank([null, "algo"])).toBe(false);
  });

  it("recorre elementos React anidados (el caso real de un <li> de react-markdown a medio streamear)", () => {
    // Un <li> cuyo único hijo es un <p> vacío: el estado exacto que deja el
    // parser de markdown cuando solo ha llegado "- " y el texto del ítem
    // todavía no.
    const emptyParagraph = createElement("p", null, "");
    expect(isBlank(emptyParagraph)).toBe(true);

    const realParagraph = createElement("p", null, "Comprar leche");
    expect(isBlank(realParagraph)).toBe(false);
  });
});
