import { describe, expect, it } from "vitest";
import { nextPriority, PRIORIDADES, ESTADOS_TABLERO, shouldClearEnProgreso, parseVista, matchesVista } from "../src/lib/kanban";

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

describe("parseVista", () => {
  it("acepta las vistas conocidas", () => {
    expect(parseVista("vencidas")).toBe("vencidas");
    expect(parseVista("hoy")).toBe("hoy");
    expect(parseVista("mias")).toBe("mias");
  });

  it("ante una vista inventada en la URL cae en 'todas', no deja el tablero vacío", () => {
    expect(parseVista("marciano")).toBe("todas");
    expect(parseVista(undefined)).toBe("todas");
    expect(parseVista("")).toBe("todas");
  });
});

describe("matchesVista", () => {
  const AHORA = new Date("2026-08-18T15:00:00");
  const tarea = (fechaLimite: Date | null, assigneeId: string | null = null) => ({ fechaLimite, assigneeId });

  it("'todas' no filtra nada, ni siquiera lo que no tiene fecha", () => {
    expect(matchesVista(tarea(null), "todas", "u1", AHORA)).toBe(true);
  });

  it("una tarea que vence HOY no cuenta como vencida", () => {
    // El caso que más fácil se rompe: comparar contra "ahora" en vez de
    // contra el principio del día metería en "vencidas" todo lo de esta
    // misma mañana, que todavía da tiempo a hacer.
    const estaManana = new Date("2026-08-18T09:00:00");
    expect(matchesVista(tarea(estaManana), "vencidas", "u1", AHORA)).toBe(false);
    expect(matchesVista(tarea(estaManana), "hoy", "u1", AHORA)).toBe(true);
  });

  it("ayer sí está vencida; mañana no está ni vencida ni es de hoy", () => {
    const ayer = new Date("2026-08-17T23:59:00");
    const manana = new Date("2026-08-19T00:00:00");
    expect(matchesVista(tarea(ayer), "vencidas", "u1", AHORA)).toBe(true);
    expect(matchesVista(tarea(manana), "vencidas", "u1", AHORA)).toBe(false);
    expect(matchesVista(tarea(manana), "hoy", "u1", AHORA)).toBe(false);
  });

  it("sin fecha límite no entra en vistas de fecha (no es que 'venza hoy')", () => {
    expect(matchesVista(tarea(null), "vencidas", "u1", AHORA)).toBe(false);
    expect(matchesVista(tarea(null), "hoy", "u1", AHORA)).toBe(false);
  });

  it("'mias' mira la asignación, no la fecha — una tarea mía sin fecha también es mía", () => {
    expect(matchesVista(tarea(null, "u1"), "mias", "u1", AHORA)).toBe(true);
    expect(matchesVista(tarea(null, "u2"), "mias", "u1", AHORA)).toBe(false);
    expect(matchesVista(tarea(null, null), "mias", "u1", AHORA)).toBe(false);
  });
});
