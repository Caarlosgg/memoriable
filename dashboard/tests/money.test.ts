import { describe, expect, it } from "vitest";
import { formatCentimos, parseEurosToCentimos } from "../src/lib/money";

// Intl.NumberFormat("es-ES", ...) usa un espacio NO separable (U+00A0) entre
// el número y el símbolo, no un espacio normal — de ahí este helper en vez
// de escribirlo a mano en cada expectativa (fácil de teclear mal sin verlo).
const NBSP = " ";

describe("formatCentimos", () => {
  it("formatea céntimos como euros con coma decimal", () => {
    // es-ES con la ICU de Node no agrupa miles por debajo de 5 cifras
    // (es-ES tiene "mínimo de dígitos para agrupar" = 2): 1234 se escribe
    // "1234", no "1.234" — es el comportamiento real verificado, no un bug.
    expect(formatCentimos(123456)).toBe(`1234,56${NBSP}€`);
  });

  it("agrupa los miles a partir de 5 cifras", () => {
    expect(formatCentimos(1234567)).toBe(`12.345,67${NBSP}€`);
  });

  it("formatea cero correctamente", () => {
    expect(formatCentimos(0)).toBe(`0,00${NBSP}€`);
  });

  it("formatea negativos (retiradas)", () => {
    expect(formatCentimos(-500)).toBe(`-5,00${NBSP}€`);
  });
});

describe("parseEurosToCentimos", () => {
  it("acepta coma decimal", () => {
    expect(parseEurosToCentimos("12,50")).toBe(1250);
  });

  it("acepta punto decimal", () => {
    expect(parseEurosToCentimos("12.50")).toBe(1250);
  });

  it("acepta un número entero sin decimales", () => {
    expect(parseEurosToCentimos("100")).toBe(10000);
  });

  it("redondea al céntimo más cercano", () => {
    expect(parseEurosToCentimos("1,01")).toBe(101);
  });

  it("devuelve null para texto vacío o no numérico", () => {
    expect(parseEurosToCentimos("")).toBeNull();
    expect(parseEurosToCentimos("   ")).toBeNull();
    expect(parseEurosToCentimos("abc")).toBeNull();
  });

  it("es el inverso de formatCentimos para un caso normal (ida y vuelta)", () => {
    const centimos = 250000;
    expect(parseEurosToCentimos(String(centimos / 100))).toBe(centimos);
  });
});
