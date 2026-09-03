import { describe, expect, it } from "vitest";
import { displayName, shortEmailName } from "../src/lib/format";

describe("displayName", () => {
  it("usa el nombre cuando lo hay", () => {
    expect(displayName({ nombre: "Ana Pérez", email: "ana@example.com" })).toBe("Ana Pérez");
  });

  it("cae al email troceado cuando la cuenta no tiene nombre", () => {
    // El caso de todas las cuentas anteriores a que el registro pidiera
    // nombre: nunca deben verse en blanco.
    expect(displayName({ nombre: null, email: "ana@example.com" })).toBe("ana");
    expect(displayName({ email: "ana@example.com" })).toBe("ana");
  });

  it("trata un nombre en blanco como si no lo hubiera", () => {
    expect(displayName({ nombre: "   ", email: "ana@example.com" })).toBe("ana");
  });

  it("recorta los espacios de un nombre válido", () => {
    expect(displayName({ nombre: "  Ana  ", email: "ana@example.com" })).toBe("Ana");
  });
});

describe("shortEmailName", () => {
  it("devuelve la parte local del email", () => {
    expect(shortEmailName("ana.lopez@example.com")).toBe("ana.lopez");
  });
});
