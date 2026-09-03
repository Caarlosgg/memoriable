import { describe, expect, it } from "vitest";
import { filtersFromParams } from "@/components/NotesExplorer";

const vacio = { categoria: "todos", estado: "todos", prioridad: "todos", desde: "", hasta: "" };

describe("filtersFromParams", () => {
  it("sin parámetros, todo por defecto", () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual(vacio);
  });

  it("lee los filtros de la URL — es lo que permite compartir una búsqueda", () => {
    const params = new URLSearchParams(
      "categoria=tarea&estado=EN_PROGRESO&prioridad=ALTA&desde=2026-01-01&hasta=2026-02-01",
    );
    expect(filtersFromParams(params)).toEqual({
      categoria: "tarea",
      estado: "EN_PROGRESO",
      prioridad: "ALTA",
      desde: "2026-01-01",
      hasta: "2026-02-01",
    });
  });

  it("un valor inventado cae al de por defecto, no rompe la pantalla", () => {
    // La URL la puede escribir cualquiera a mano: una pantalla en blanco
    // por un parámetro mal escrito no ayuda a nadie.
    const params = new URLSearchParams("categoria=inventada&estado=RARO&prioridad=XXL");
    expect(filtersFromParams(params)).toEqual(vacio);
  });

  it("los filtros son independientes: uno malo no tumba a los buenos", () => {
    const params = new URLSearchParams("categoria=tarea&estado=NOEXISTE");
    expect(filtersFromParams(params)).toMatchObject({ categoria: "tarea", estado: "todos" });
  });
});
