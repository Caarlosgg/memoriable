import { describe, expect, it } from "vitest";
import { nextPriority, nextEstado, PRIORIDADES, ESTADOS_TABLERO, shouldClearEnProgreso } from "../src/lib/kanban";

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

describe("shouldClearEnProgreso", () => {
  it("true si el nuevo estado es HECHO", () => {
    expect(shouldClearEnProgreso("HECHO")).toBe(true);
  });

  it("false si el estado no es HECHO y no se toca la categoría", () => {
    expect(shouldClearEnProgreso("EN_PROGRESO")).toBe(false);
    expect(shouldClearEnProgreso("POR_HACER")).toBe(false);
  });

  it("true si la categoría cambia a una no accionable, aunque el estado no cambie a HECHO", () => {
    // Caso real encontrado en revisión de código: cambiar SOLO la
    // categoría (dejando el estado en EN_PROGRESO) dejaba una tarjeta
    // huérfana en "en curso ahora" para siempre, sin forma de soltarla
    // desde el tablero (getBoardGroups ya no la muestra).
    expect(shouldClearEnProgreso("EN_PROGRESO", "nota")).toBe(true);
  });

  it("false si la categoría cambia pero sigue siendo accionable", () => {
    expect(shouldClearEnProgreso("EN_PROGRESO", "recordatorio")).toBe(false);
  });

  it("false sin argumentos (ningún cambio de estado ni categoría en el patch)", () => {
    expect(shouldClearEnProgreso(undefined)).toBe(false);
    expect(shouldClearEnProgreso(undefined, undefined)).toBe(false);
  });
});
