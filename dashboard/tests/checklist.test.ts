import { describe, expect, it } from "vitest";
import { checklistToArray, checklistToJson, checklistProgress } from "../src/lib/checklist";

describe("checklistToArray", () => {
  it("con un valor que no es array, devuelve vacío", () => {
    expect(checklistToArray(null)).toEqual([]);
    expect(checklistToArray(undefined)).toEqual([]);
    expect(checklistToArray("algo")).toEqual([]);
    expect(checklistToArray({})).toEqual([]);
  });

  it("lee un array bien formado tal cual", () => {
    const result = checklistToArray([{ id: "a", texto: "Comprar globos", hecho: false }]);
    expect(result).toEqual([{ id: "a", texto: "Comprar globos", hecho: false }]);
  });

  it("rellena defensivamente filas con forma inesperada", () => {
    const result = checklistToArray([{ texto: 123, hecho: "sí" }, null, "no-es-objeto"]);
    expect(result[0]).toMatchObject({ texto: "", hecho: false });
    expect(result[0]!.id).toMatch(/.+/);
    expect(result[1]).toMatchObject({ texto: "", hecho: false });
    expect(result[2]).toMatchObject({ texto: "", hecho: false });
  });

  it("conserva un id ya existente en vez de generar uno nuevo", () => {
    const result = checklistToArray([{ id: "fijo", texto: "x", hecho: true }]);
    expect(result[0]!.id).toBe("fijo");
  });
});

describe("checklistToJson", () => {
  it("descarta filas sin texto (tras recortar espacios)", () => {
    const result = checklistToJson([
      { id: "a", texto: "  ", hecho: false },
      { id: "b", texto: "Comprar globos", hecho: false },
    ]);
    expect(result).toEqual([{ id: "b", texto: "Comprar globos", hecho: false }]);
  });

  it("recorta espacios sobrantes del texto que sí se guarda", () => {
    const result = checklistToJson([{ id: "a", texto: "  Llamar  ", hecho: true }]);
    expect(result).toEqual([{ id: "a", texto: "Llamar", hecho: true }]);
  });
});

describe("checklistProgress", () => {
  it("cuenta hechos y total", () => {
    const items = [
      { id: "a", texto: "1", hecho: true },
      { id: "b", texto: "2", hecho: false },
      { id: "c", texto: "3", hecho: true },
    ];
    expect(checklistProgress(items)).toEqual({ hechos: 2, total: 3 });
  });

  it("con lista vacía, 0/0", () => {
    expect(checklistProgress([])).toEqual({ hechos: 0, total: 0 });
  });
});
