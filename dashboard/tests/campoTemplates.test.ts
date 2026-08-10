import { describe, expect, it } from "vitest";
import { campoTemplateToArray, campoTemplateToJson } from "../src/lib/campoTemplates";

describe("campoTemplateToArray", () => {
  it("convierte el JSON guardado a un array editable (sin valor)", () => {
    const json = { Empresa: { tipo: "texto" }, Presupuesto: { tipo: "numero" } };
    expect(campoTemplateToArray(json)).toEqual([
      { nombre: "Empresa", tipo: "texto" },
      { nombre: "Presupuesto", tipo: "numero" },
    ]);
  });

  it("devuelve un array vacío ante null, undefined o forma inesperada", () => {
    expect(campoTemplateToArray(null)).toEqual([]);
    expect(campoTemplateToArray(undefined)).toEqual([]);
    expect(campoTemplateToArray("no es un objeto")).toEqual([]);
    expect(campoTemplateToArray([1, 2, 3])).toEqual([]);
  });

  it("cae a tipo texto si una entrada viene con forma rara", () => {
    const json = { rota: { tipo: "no-es-un-tipo-valido" } };
    expect(campoTemplateToArray(json)).toEqual([{ nombre: "rota", tipo: "texto" }]);
  });
});

describe("campoTemplateToJson", () => {
  it("compone el array de vuelta al JSON de guardado", () => {
    const rows = [
      { nombre: "Empresa", tipo: "texto" as const },
      { nombre: "Presupuesto", tipo: "numero" as const },
    ];
    expect(campoTemplateToJson(rows)).toEqual({
      Empresa: { tipo: "texto" },
      Presupuesto: { tipo: "numero" },
    });
  });

  it("descarta las filas sin nombre (o solo espacios)", () => {
    const rows = [
      { nombre: "  ", tipo: "texto" as const },
      { nombre: "Contacto", tipo: "texto" as const },
    ];
    expect(campoTemplateToJson(rows)).toEqual({ Contacto: { tipo: "texto" } });
  });

  it("es el inverso de campoTemplateToArray para un caso normal", () => {
    const json = { Fecha: { tipo: "fecha" } };
    expect(campoTemplateToJson(campoTemplateToArray(json))).toEqual(json);
  });
});
