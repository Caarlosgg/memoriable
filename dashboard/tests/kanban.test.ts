import { describe, expect, it } from "vitest";
import { nextPriority, PRIORIDADES, ESTADOS_TABLERO } from "../src/lib/kanban";

describe("nextPriority", () => {
  it("cicla Baja -> Media -> Alta -> Baja", () => {
    expect(nextPriority("BAJA")).toBe("MEDIA");
    expect(nextPriority("MEDIA")).toBe("ALTA");
    expect(nextPriority("ALTA")).toBe("BAJA");
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
