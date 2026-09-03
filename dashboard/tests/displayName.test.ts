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

describe("haceCuanto", () => {
  const ahora = new Date("2026-09-03T12:00:00.000Z");

  it("dice cuánto hace en la unidad que toca", async () => {
    const { haceCuanto } = await import("@/lib/format");
    expect(haceCuanto(new Date("2026-09-03T11:58:00.000Z"), ahora)).toBe("hace 2 min");
    expect(haceCuanto(new Date("2026-09-03T09:00:00.000Z"), ahora)).toBe("hace 3 h");
    expect(haceCuanto(new Date("2026-09-01T12:00:00.000Z"), ahora)).toBe("hace 2 d");
  });

  it("menos de un minuto es 'ahora mismo'", async () => {
    const { haceCuanto } = await import("@/lib/format");
    expect(haceCuanto(new Date("2026-09-03T11:59:50.000Z"), ahora)).toBe("ahora mismo");
  });

  it("a partir de una semana cae a la fecha: 'hace 34 d' no sitúa nada", async () => {
    const { haceCuanto } = await import("@/lib/format");
    expect(haceCuanto(new Date("2026-07-30T12:00:00.000Z"), ahora)).toMatch(/jul/);
  });

  it("una fecha en el futuro (relojes desincronizados) no sale como 'hace -3 min'", async () => {
    const { haceCuanto } = await import("@/lib/format");
    expect(haceCuanto(new Date("2026-09-03T12:05:00.000Z"), ahora)).toBe("ahora mismo");
  });

  it("una fecha inválida devuelve vacío en vez de 'Invalid Date'", async () => {
    const { haceCuanto } = await import("@/lib/format");
    expect(haceCuanto("no-es-una-fecha", ahora)).toBe("");
  });
});
