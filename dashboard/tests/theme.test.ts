import { describe, expect, it } from "vitest";
import {
  isThemePreference,
  isTextSizePreference,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
} from "../src/lib/theme";

describe("isThemePreference", () => {
  it("acepta light, dark y system", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
  });

  it("rechaza cualquier otro valor, incluido null/undefined", () => {
    expect(isThemePreference("azul")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });
});

describe("isTextSizePreference", () => {
  it("acepta normal y large", () => {
    expect(isTextSizePreference("normal")).toBe(true);
    expect(isTextSizePreference("large")).toBe(true);
  });

  it("rechaza cualquier otro valor", () => {
    expect(isTextSizePreference("enorme")).toBe(false);
    expect(isTextSizePreference(null)).toBe(false);
  });
});

describe("THEME_SCRIPT", () => {
  it("referencia las mismas claves de localStorage que exporta el módulo (nunca las repite a mano)", () => {
    expect(THEME_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_SCRIPT).toContain(TEXT_SIZE_STORAGE_KEY);
  });

  it("está envuelto en un try/catch (un localStorage bloqueado no debe romper la carga)", () => {
    expect(THEME_SCRIPT).toMatch(/try\s*{/);
    expect(THEME_SCRIPT).toContain("catch");
  });

  it("es JavaScript válido (no falla al parsearlo)", () => {
    expect(() => new Function(THEME_SCRIPT)).not.toThrow();
  });
});
