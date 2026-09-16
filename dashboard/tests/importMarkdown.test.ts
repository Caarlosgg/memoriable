import { describe, expect, it } from "vitest";
import { parseFrontmatter, parseEtiquetasFrontmatter, parseFechaFrontmatter } from "@/lib/importMarkdown";

describe("parseFrontmatter", () => {
  it("separa el bloque --- de la cabecera del cuerpo", () => {
    const { frontmatter, cuerpo } = parseFrontmatter("---\ntitle: Receta\ntags: cocina, favoritos\n---\nDos huevos y harina.");
    expect(frontmatter).toEqual({ title: "Receta", tags: "cocina, favoritos" });
    expect(cuerpo).toBe("Dos huevos y harina.");
  });

  it("sin frontmatter, todo el texto es el cuerpo", () => {
    const { frontmatter, cuerpo } = parseFrontmatter("Solo texto suelto, sin cabecera.");
    expect(frontmatter).toEqual({});
    expect(cuerpo).toBe("Solo texto suelto, sin cabecera.");
  });

  it("quita comillas simples o dobles del valor", () => {
    const { frontmatter } = parseFrontmatter('---\ntitle: "Con comillas"\n---\ncuerpo');
    expect(frontmatter.title).toBe("Con comillas");
  });

  it("ignora líneas del bloque que no son clave: valor", () => {
    const { frontmatter } = parseFrontmatter("---\ntitle: Ok\nesto no es una clave válida\n---\ncuerpo");
    expect(frontmatter).toEqual({ title: "Ok" });
  });

  it("acepta finales de línea \\r\\n (ficheros exportados desde Windows)", () => {
    const { frontmatter, cuerpo } = parseFrontmatter("---\r\ntitle: Receta\r\n---\r\nCuerpo aquí.");
    expect(frontmatter).toEqual({ title: "Receta" });
    expect(cuerpo).toBe("Cuerpo aquí.");
  });
});

describe("parseEtiquetasFrontmatter", () => {
  it("una lista separada por comas", () => {
    expect(parseEtiquetasFrontmatter("cocina, favoritos, rápido")).toEqual(["cocina", "favoritos", "rápido"]);
  });

  it("formato flow entre corchetes", () => {
    expect(parseEtiquetasFrontmatter("[cocina, favoritos]")).toEqual(["cocina", "favoritos"]);
  });

  it("sin campo, devuelve un array vacío", () => {
    expect(parseEtiquetasFrontmatter(undefined)).toEqual([]);
  });

  it("cadena vacía o solo espacios, devuelve un array vacío", () => {
    expect(parseEtiquetasFrontmatter("   ")).toEqual([]);
  });
});

describe("parseFechaFrontmatter", () => {
  it("una fecha ISO simple", () => {
    const fecha = parseFechaFrontmatter("2024-03-15");
    expect(fecha?.toISOString().slice(0, 10)).toBe("2024-03-15");
  });

  it("undefined si el campo no está", () => {
    expect(parseFechaFrontmatter(undefined)).toBeUndefined();
  });

  it("undefined si el valor no es una fecha válida, nunca lanza", () => {
    expect(parseFechaFrontmatter("esto no es una fecha")).toBeUndefined();
  });
});
