import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordConstantTime,
  needsRehash,
  generateLinkCode,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "../src/lib/auth";

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

  it("los hashes nuevos son argon2id", async () => {
    const hash = await hashPassword("una-contraseña-larga");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("sigue verificando hashes bcrypt heredados", async () => {
    const legacyHash = await bcrypt.hash("clave-vieja", 12);
    expect(await verifyPassword("clave-vieja", legacyHash)).toBe(true);
    expect(await verifyPassword("otra-cosa", legacyHash)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("un hash bcrypt heredado necesita regenerarse", async () => {
    const legacyHash = await bcrypt.hash("clave-vieja", 12);
    expect(needsRehash(legacyHash)).toBe(true);
  });

  it("un hash argon2id ya no necesita regenerarse", async () => {
    const hash = await hashPassword("clave-nueva");
    expect(needsRehash(hash)).toBe(false);
  });
});

describe("verifyPasswordConstantTime", () => {
  it("acepta la contraseña correcta contra el hash de un usuario existente", async () => {
    const hash = await hashPassword("clave-correcta");
    expect(await verifyPasswordConstantTime("clave-correcta", hash)).toBe(true);
  });

  it("rechaza la contraseña incorrecta contra un usuario existente", async () => {
    const hash = await hashPassword("clave-correcta");
    expect(await verifyPasswordConstantTime("otra", hash)).toBe(false);
  });

  it("devuelve false cuando el usuario no existe (hash null), sin lanzar", async () => {
    // Aun así ejecuta una comparación real (contra el hash de relleno) para
    // no delatar por tiempo que la cuenta no existe.
    expect(await verifyPasswordConstantTime("cualquiera", null)).toBe(false);
  });

  it("también funciona contra un hash bcrypt heredado (durante la migración)", async () => {
    const legacyHash = await bcrypt.hash("clave-vieja", 12);
    expect(await verifyPasswordConstantTime("clave-vieja", legacyHash)).toBe(true);
    expect(await verifyPasswordConstantTime("otra-cosa", legacyHash)).toBe(false);
  });
});

describe("límites de contraseña", () => {
  it("el mínimo es razonable, no trivial", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });

  it("el máximo es 72 (límite real de bcrypt)", () => {
    expect(MAX_PASSWORD_LENGTH).toBe(72);
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
