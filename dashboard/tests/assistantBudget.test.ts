import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { assistantBudget: { upsert: (...a: unknown[]) => upsert(...a) } },
}));

beforeEach(() => {
  upsert.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tryConsumeAssistantBudget", () => {
  it("con maxPerDay <= 0, corta antes de tocar la base de datos", async () => {
    const { tryConsumeAssistantBudget } = await import("../src/lib/assistantBudget");

    await expect(tryConsumeAssistantBudget(0, "u1")).resolves.toBe(false);
    await expect(tryConsumeAssistantBudget(-1, "u1")).resolves.toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("deja pasar mientras el recuento no supere el máximo", async () => {
    upsert.mockResolvedValue({ day: "2026-08-22", userId: "u1", count: 5 });
    const { tryConsumeAssistantBudget } = await import("../src/lib/assistantBudget");

    // El recuento ya incluye ESTA petición (el upsert la reserva al
    // llamar) — 5 de un máximo de 5 todavía se deja procesar.
    await expect(tryConsumeAssistantBudget(5, "u1")).resolves.toBe(true);
  });

  it("corta en cuanto el recuento supera el máximo", async () => {
    upsert.mockResolvedValue({ day: "2026-08-22", userId: "u1", count: 6 });
    const { tryConsumeAssistantBudget } = await import("../src/lib/assistantBudget");

    await expect(tryConsumeAssistantBudget(5, "u1")).resolves.toBe(false);
  });

  it("reserva la petición ANTES de saber si se acepta — increment/create en una sola llamada atómica", async () => {
    upsert.mockResolvedValue({ day: "2026-08-22", userId: "u1", count: 1 });
    const { tryConsumeAssistantBudget } = await import("../src/lib/assistantBudget");

    await tryConsumeAssistantBudget(5, "u1");

    // Nace en 1 el primer día, o incrementa si ya había fila — nunca lee
    // primero y decide después (evitaría condiciones de carrera entre
    // peticiones concurrentes).
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { day: expect.any(String), userId: "u1", count: 1 },
        update: { count: { increment: 1 } },
      }),
    );
  });

  it("usa el día UTC como clave — dos días distintos son dos filas distintas", async () => {
    upsert.mockResolvedValue({ day: "x", userId: "u1", count: 1 });
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-08-22T23:50:00.000Z"));
    const { tryConsumeAssistantBudget } = await import("../src/lib/assistantBudget");
    await tryConsumeAssistantBudget(5, "u1");
    const primerDia = upsert.mock.calls[0]![0].where.day_userId.day;

    vi.setSystemTime(new Date("2026-08-23T00:10:00.000Z"));
    await tryConsumeAssistantBudget(5, "u1");
    const segundoDia = upsert.mock.calls[1]![0].where.day_userId.day;

    expect(primerDia).toBe("2026-08-22");
    expect(segundoDia).toBe("2026-08-23");
    expect(primerDia).not.toBe(segundoDia);
  });

  it("dos usuarios distintos el mismo día tienen contadores independientes", async () => {
    // El bug real que arregla esta fase: antes la clave era solo `day`, así
    // que un usuario preguntando mucho agotaba el límite de TODOS los
    // demás. Ahora cada upsert va a su propia fila (day, userId).
    upsert.mockResolvedValue({ day: "2026-08-22", userId: "u1", count: 1 });
    const { tryConsumeAssistantBudget } = await import("../src/lib/assistantBudget");

    await tryConsumeAssistantBudget(5, "u1");
    await tryConsumeAssistantBudget(5, "u2");

    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { day_userId: { day: expect.any(String), userId: "u1" } } }),
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { day_userId: { day: expect.any(String), userId: "u2" } } }),
    );
  });
});
