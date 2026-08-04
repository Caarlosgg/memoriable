import { describe, expect, it, vi, beforeEach } from "vitest";

// `clientIp` importa next/headers (solo servidor); no se usa en estos tests,
// pero el import debe resolver. Se stubea para no arrastrar el runtime de Next.
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import { checkRateLimit } from "../src/lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Claves distintas por test para no compartir estado (el store es de módulo).
  });

  it("permite hasta el límite y bloquea el siguiente intento", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reinicia la cuenta cuando pasa la ventana", () => {
    const key = `test:${Math.random()}`;
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(1_000);
    expect(checkRateLimit(key, 1, 10_000).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 10_000).allowed).toBe(false);

    // Pasada la ventana (10s), vuelve a permitir.
    now.mockReturnValue(1_000 + 10_001);
    expect(checkRateLimit(key, 1, 10_000).allowed).toBe(true);

    now.mockRestore();
  });

  it("cuenta cada clave por separado", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(checkRateLimit(a, 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit(a, 1, 60_000).allowed).toBe(false);
    // b es una clave distinta: su propia cuenta.
    expect(checkRateLimit(b, 1, 60_000).allowed).toBe(true);
  });
});
