import { describe, expect, it } from "vitest";
import { camposExtraToArray, camposExtraToJson } from "../src/lib/camposExtra";

describe("camposExtraToArray", () => {
  it("convierte el JSON guardado a un array editable", () => {
    const json = { talla: { tipo: "texto", valor: "42" }, precio: { tipo: "numero", valor: "19.99" } };
    expect(camposExtraToArray(json)).toEqual([
      { nombre: "talla", tipo: "texto", valor: "42" },
      { nombre: "precio", tipo: "numero", valor: "19.99" },
    ]);
  });

  it("devuelve un array vacío ante null, undefined o forma inesperada", () => {
    expect(camposExtraToArray(null)).toEqual([]);
    expect(camposExtraToArray(undefined)).toEqual([]);
    expect(camposExtraToArray("no es un objeto")).toEqual([]);
    expect(camposExtraToArray([1, 2, 3])).toEqual([]);
  });

  it("cae a tipo texto y valor vacío si una entrada viene con forma rara", () => {
    const json = { rota: { tipo: "no-es-un-tipo-valido", valor: 123 } };
    expect(camposExtraToArray(json)).toEqual([{ nombre: "rota", tipo: "texto", valor: "" }]);
  });
});

describe("camposExtraToJson", () => {
  it("compone el array de vuelta al JSON de guardado", () => {
    const rows = [
      { nombre: "talla", tipo: "texto" as const, valor: "42" },
      { nombre: "precio", tipo: "numero" as const, valor: "19.99" },
    ];
    expect(camposExtraToJson(rows)).toEqual({
      talla: { tipo: "texto", valor: "42" },
      precio: { tipo: "numero", valor: "19.99" },
    });
  });

  it("descarta las filas sin nombre (o solo espacios)", () => {
    const rows = [
      { nombre: "  ", tipo: "texto" as const, valor: "se descarta" },
      { nombre: "válido", tipo: "texto" as const, valor: "se guarda" },
    ];
    expect(camposExtraToJson(rows)).toEqual({ válido: { tipo: "texto", valor: "se guarda" } });
  });

  it("es el inverso de camposExtraToArray para un caso normal", () => {
    const json = { a: { tipo: "fecha", valor: "2026-08-05" } };
    expect(camposExtraToJson(camposExtraToArray(json))).toEqual(json);
  });
});
