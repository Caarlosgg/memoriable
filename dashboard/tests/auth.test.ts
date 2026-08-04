import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, generateLinkCode, MIN_PASSWORD_LENGTH } from "../src/lib/auth";

describe("hashPassword/verifyPassword", () => {
  it("un hash verifica correctamente contra la contraseña original", async () => {
    const hash = await hashPassword("una-contraseña-larga");
    expect(await verifyPassword("una-contraseña-larga", hash)).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await hashPassword("una-contraseña-larga");
    expect(await verifyPassword("otra-cosa", hash)).toBe(false);
  });

  it("nunca guarda la contraseña en claro dentro del hash", async () => {
    const hash = await hashPassword("secreto-super-visible");
    expect(hash).not.toContain("secreto-super-visible");
  });

  it("dos hashes de la misma contraseña son distintos (salt aleatorio)", async () => {
    const a = await hashPassword("misma-contraseña");
    const b = await hashPassword("misma-contraseña");
    expect(a).not.toBe(b);
  });
});

describe("MIN_PASSWORD_LENGTH", () => {
  it("es un mínimo razonable, no trivial", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });
});

describe("generateLinkCode", () => {
  it("genera un código numérico de 6 dígitos", () => {
    const { code } = generateLinkCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("expira en el futuro, en torno a 10 minutos", () => {
    const before = Date.now();
    const { expiresAt } = generateLinkCode();
    const deltaMinutes = (expiresAt.getTime() - before) / 60_000;
    expect(deltaMinutes).toBeGreaterThan(9);
    expect(deltaMinutes).toBeLessThanOrEqual(10);
  });

  it("genera códigos distintos entre llamadas (no determinista)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateLinkCode().code));
    expect(codes.size).toBeGreaterThan(1);
  });
});
