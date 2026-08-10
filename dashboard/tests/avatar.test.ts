import { describe, expect, it } from "vitest";
import { initialsFromEmail, avatarColorClass } from "../src/lib/avatar";

describe("initialsFromEmail", () => {
  it("usa la primera letra de cada parte separada por punto", () => {
    expect(initialsFromEmail("ana.garcia@example.com")).toBe("AG");
  });

  it("usa la primera letra de cada parte separada por guion o guion bajo", () => {
    expect(initialsFromEmail("ana-garcia@example.com")).toBe("AG");
    expect(initialsFromEmail("ana_garcia@example.com")).toBe("AG");
  });

  it("sin separador, usa las dos primeras letras del local-part", () => {
    expect(initialsFromEmail("ana@example.com")).toBe("AN");
  });

  it("siempre en mayúsculas", () => {
    expect(initialsFromEmail("juan.perez@example.com")).toBe("JP");
  });
});

describe("avatarColorClass", () => {
  it("el mismo email siempre da el mismo color", () => {
    const a = avatarColorClass("ana@example.com");
    const b = avatarColorClass("ana@example.com");
    expect(a).toBe(b);
  });

  it("emails distintos pueden dar colores distintos (no todos caen en el mismo hueco)", () => {
    const colors = new Set([
      avatarColorClass("ana@example.com"),
      avatarColorClass("bruno@example.com"),
      avatarColorClass("carla@example.com"),
      avatarColorClass("dani@example.com"),
      avatarColorClass("elena@example.com"),
      avatarColorClass("fran@example.com"),
    ]);
    expect(colors.size).toBeGreaterThan(1);
  });
});
