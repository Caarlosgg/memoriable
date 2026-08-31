import { describe, expect, it } from "vitest";
import { statesMatch } from "../src/lib/timingSafeEqual";

describe("statesMatch", () => {
  it("cadenas iguales coinciden", () => {
    expect(statesMatch("abc123", "abc123")).toBe(true);
  });

  it("cadenas distintas de la MISMA longitud no coinciden", () => {
    expect(statesMatch("abc123", "abc124")).toBe(false);
  });

  it("cadenas de longitud DISTINTA no coinciden, y no lanza (timingSafeEqual exige buffers del mismo tamaño)", () => {
    expect(() => statesMatch("abc", "abcdef")).not.toThrow();
    expect(statesMatch("abc", "abcdef")).toBe(false);
  });

  it("cadenas vacías coinciden entre sí", () => {
    expect(statesMatch("", "")).toBe(true);
  });
});
