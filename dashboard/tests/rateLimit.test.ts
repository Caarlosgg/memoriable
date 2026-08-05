import { describe, expect, it, vi, beforeEach } from "vitest";

// `clientIp` importa next/headers (solo servidor); no se usa en estos tests,
// pero el import debe resolver. Se stubea para no arrastrar el runtime de Next.
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

// El limitador vive respaldado en Postgres (upsert atómico, mismo patrón
// que tryConsumeAssistantBudget) — se mockea el cliente de Prisma para
// probar la lógica (bucketing por ventana, cálculo de retryAfterSeconds,
// fail-open ante un fallo de BD) sin tocar una base de datos real.
const upsert = vi.fn();
const deleteMany = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: { rateLimitBucket: { upsert: (...args: unknown[]) => upsert(...args), deleteMany: (...args: unknown[]) => deleteMany(...args) } },
}));

import { checkRateLimit, purgeOldRateLimitBuckets } from "../src/lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    upsert.mockReset();
  });

  it("permite mientras el conteo no supere el límite", async () => {
    upsert.mockResolvedValue({ count: 3 });
    const result = await checkRateLimit("login:1.2.3.4", 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("bloquea cuando el conteo supera el límite, con retryAfterSeconds > 0", async () => {
    upsert.mockResolvedValue({ count: 4 });
    const result = await checkRateLimit("login:1.2.3.4", 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("calcula la ventana (windowStart) alineada a windowMs desde epoch", async () => {
    upsert.mockResolvedValue({ count: 1 });
    const now = vi.spyOn(Date, "now").mockReturnValue(125_000); // 2m 5s
    await checkRateLimit("clave", 5, 60_000); // ventanas de 1 minuto

    const args = upsert.mock.calls[0]![0] as { where: { bucketKey_windowStart: { windowStart: Date } } };
    // 125_000 cae en la ventana [120_000, 180_000) -> windowStart = 120_000
    expect(args.where.bucketKey_windowStart.windowStart.getTime()).toBe(120_000);

    now.mockRestore();
  });

  it("deja pasar la petición (fail-open) si la BD falla", async () => {
    upsert.mockRejectedValue(new Error("conexión caída"));
    const result = await checkRateLimit("login:1.2.3.4", 3, 60_000);
    expect(result.allowed).toBe(true);
  });
});

describe("purgeOldRateLimitBuckets", () => {
  it("borra ventanas de más de un día", async () => {
    deleteMany.mockResolvedValue({ count: 7 });
    const deleted = await purgeOldRateLimitBuckets();
    expect(deleted).toBe(7);
    const args = deleteMany.mock.calls[0]![0] as { where: { windowStart: { lt: Date } } };
    const cutoff = args.where.windowStart.lt;
    const ageMs = Date.now() - cutoff.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });
});
