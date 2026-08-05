import { describe, expect, it } from "vitest";
import { nextPriority, nextEstado, PRIORIDADES, ESTADOS_TABLERO } from "../src/lib/kanban";

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
