import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
const notificationFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    notification: { findFirst: (...args: unknown[]) => notificationFindFirst(...args) },
  },
}));

const createNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

const AHORA = new Date("2026-09-03T10:00:00");

function tarea(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
    resumen: "Pagar la luz",
    fechaLimite: new Date("2026-09-03T23:59:59"),
    userId: "ana",
    assigneeId: null,
    workspaceId: "ws1",
    ...over,
  };
}

beforeEach(() => {
  messageFindMany.mockReset();
  messageFindMany.mockResolvedValue([]);
  notificationFindFirst.mockReset();
  notificationFindFirst.mockResolvedValue(null);
  createNotification.mockReset();
});

describe("enviarAvisosDeVencimiento", () => {
  it("avisa de lo que vence, que es lo que el producto prometía y no hacía", async () => {
    messageFindMany.mockResolvedValue([tarea()]);
    const { enviarAvisosDeVencimiento } = await import("@/lib/avisosVencimiento");

    const resultado = await enviarAvisosDeVencimiento(AHORA);

    expect(resultado).toEqual({ encontradas: 1, avisadas: 1 });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "ana", type: "DUE_SOON" }),
    );
  });

  it("avisa al ASIGNADO, no a quien la escribió", async () => {
    // Avisar al autor dejaría sin enterarse justo a quien tiene que hacerla.
    messageFindMany.mockResolvedValue([tarea({ assigneeId: "bruno" })]);
    const { enviarAvisosDeVencimiento } = await import("@/lib/avisosVencimiento");

    await enviarAvisosDeVencimiento(AHORA);

    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "bruno" }));
  });

  it("no repite el aviso si ya se mandó hoy (el cron puede dispararse dos veces)", async () => {
    messageFindMany.mockResolvedValue([tarea()]);
    notificationFindFirst.mockResolvedValue({ id: "n1" });
    const { enviarAvisosDeVencimiento } = await import("@/lib/avisosVencimiento");

    const resultado = await enviarAvisosDeVencimiento(AHORA);

    expect(resultado).toEqual({ encontradas: 1, avisadas: 0 });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("un fallo con una tarea no deja sin aviso a las siguientes", async () => {
    messageFindMany.mockResolvedValue([tarea({ id: "m1" }), tarea({ id: "m2" })]);
    createNotification.mockRejectedValueOnce(new Error("push caído"));
    const { enviarAvisosDeVencimiento } = await import("@/lib/avisosVencimiento");

    const resultado = await enviarAvisosDeVencimiento(AHORA);

    expect(resultado.avisadas).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it("solo mira lo accionable y sin hacer: una idea con fecha no vence", async () => {
    const { enviarAvisosDeVencimiento } = await import("@/lib/avisosVencimiento");
    await enviarAvisosDeVencimiento(AHORA);

    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hecho: false,
          categoria: { in: ["tarea", "recordatorio"] },
        }),
      }),
    );
  });
});

describe("limiteVentana", () => {
  it("corta al FINAL del día: una tarea para mañana sigue a tiempo hasta que mañana acabe", async () => {
    const { limiteVentana } = await import("@/lib/avisosVencimiento");
    const limite = limiteVentana(AHORA);

    expect(limite.getDate()).toBe(4);
    expect(limite.getHours()).toBe(23);
    expect(limite.getMinutes()).toBe(59);
  });
});

describe("textoVencimiento", () => {
  it("distingue hoy, mañana y lo ya vencido", async () => {
    const { textoVencimiento } = await import("@/lib/avisosVencimiento");

    expect(textoVencimiento(new Date("2026-09-03T18:00:00"), AHORA)).toBe("vence hoy");
    expect(textoVencimiento(new Date("2026-09-04T09:00:00"), AHORA)).toBe("vence mañana");
    expect(textoVencimiento(new Date("2026-09-01T09:00:00"), AHORA)).toBe("venció ya");
  });

  it("una fecha más lejana se dice con el día, no con un número de días", async () => {
    const { textoVencimiento } = await import("@/lib/avisosVencimiento");
    expect(textoVencimiento(new Date("2026-09-10T09:00:00"), AHORA)).toContain("septiembre");
  });
});
