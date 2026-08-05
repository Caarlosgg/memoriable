import { describe, expect, it } from "vitest";
import { nextPriority, nextEstado, PRIORIDADES, ESTADOS_TABLERO, readBoardFilters } from "../src/lib/kanban";

describe("nextPriority", () => {
  it("cicla Baja -> Media -> Alta -> Baja", () => {
    expect(nextPriority("BAJA")).toBe("MEDIA");
    expect(nextPriority("MEDIA")).toBe("ALTA");
    expect(nextPriority("ALTA")).toBe("BAJA");
  });
});

describe("nextEstado", () => {
  it("cicla Por hacer -> En progreso -> Hecho -> Por hacer", () => {
    expect(nextEstado("POR_HACER")).toBe("EN_PROGRESO");
    expect(nextEstado("EN_PROGRESO")).toBe("HECHO");
    expect(nextEstado("HECHO")).toBe("POR_HACER");
  });
});

describe("ESTADOS_TABLERO", () => {
  it("las tres columnas, en el orden de izquierda a derecha", () => {
    expect(ESTADOS_TABLERO).toEqual(["POR_HACER", "EN_PROGRESO", "HECHO"]);
  });
});

describe("PRIORIDADES", () => {
  it("orden creciente", () => {
    expect(PRIORIDADES).toEqual(["BAJA", "MEDIA", "ALTA"]);
  });
});

describe("readBoardFilters", () => {
  it("lee categoría y prioridad válidas del JSON guardado", () => {
    expect(readBoardFilters({ categoria: "tarea", prioridad: "ALTA" })).toEqual({
      categoria: "tarea",
      prioridad: "ALTA",
    });
  });

  it("ignora una categoría desconocida sin lanzar", () => {
    expect(readBoardFilters({ categoria: "marciano" })).toEqual({ categoria: undefined, prioridad: undefined });
  });

  it("ignora una prioridad desconocida sin lanzar", () => {
    expect(readBoardFilters({ prioridad: "URGENTISIMA" })).toEqual({ categoria: undefined, prioridad: undefined });
  });

  it("devuelve vacío ante null, undefined o un valor que no es objeto", () => {
    expect(readBoardFilters(null)).toEqual({});
    expect(readBoardFilters(undefined)).toEqual({});
    expect(readBoardFilters("texto suelto")).toEqual({});
    expect(readBoardFilters(42)).toEqual({});
  });

  it("devuelve vacío ante el objeto por defecto ({})", () => {
    expect(readBoardFilters({})).toEqual({ categoria: undefined, prioridad: undefined });
  });
});
