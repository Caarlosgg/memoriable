import { describe, expect, it, vi, beforeEach } from "vitest";

const userFindMany = vi.fn();
const messageCount = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    message: { count: (...a: unknown[]) => messageCount(...a) },
  },
}));

const resolveAmbientStats = vi.fn();
vi.mock("@/lib/assistantAmbient", () => ({
  resolveAmbientStats: (...a: unknown[]) => resolveAmbientStats(...a),
}));

const sendWeeklyDigestEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendWeeklyDigestEmail: (...a: unknown[]) => sendWeeklyDigestEmail(...a),
}));

const AHORA = new Date("2026-09-14T08:00:00.000Z");
const VACIO = { pendientesCount: 0, vencidasCount: 0, eventosProximos: [], eventosProximosCount: 0 };

describe("enviarResumenSemanal", () => {
  beforeEach(() => {
    userFindMany.mockReset();
    messageCount.mockReset();
    messageCount.mockResolvedValue(0);
    resolveAmbientStats.mockReset();
    resolveAmbientStats.mockResolvedValue(VACIO);
    sendWeeklyDigestEmail.mockReset();
    sendWeeklyDigestEmail.mockResolvedValue(true);
  });

  it("filtra por preferencia activa, email verificado, sin el dominio sintético de Telegram, y con espacio personal", async () => {
    userFindMany.mockResolvedValue([]);
    const { enviarResumenSemanal } = await import("../src/lib/weeklyDigest");

    await enviarResumenSemanal("https://memoriable.example", AHORA);

    expect(userFindMany).toHaveBeenCalledWith({
      where: {
        weeklyDigestEmail: true,
        emailVerified: true,
        email: { not: { endsWith: "@telegram.memoriable.local" } },
        personalWorkspaceId: { not: null },
      },
      select: { id: true, email: true, personalWorkspaceId: true },
    });
  });

  it("con algo que contar, manda el correo con la URL al espacio personal", async () => {
    userFindMany.mockResolvedValue([{ id: "u1", email: "ana@example.com", personalWorkspaceId: "ws1" }]);
    resolveAmbientStats.mockResolvedValue({ pendientesCount: 3, vencidasCount: 1, eventosProximos: [], eventosProximosCount: 0 });
    messageCount.mockResolvedValue(5);
    const { enviarResumenSemanal } = await import("../src/lib/weeklyDigest");

    const resultado = await enviarResumenSemanal("https://memoriable.example", AHORA);

    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith("ana@example.com", {
      pendientesCount: 3,
      vencidasCount: 1,
      eventosProximos: [],
      eventosProximosCount: 0,
      notasNuevas: 5,
      url: "https://memoriable.example/inicio",
    });
    expect(resultado).toEqual({ elegibles: 1, enviados: 1 });
  });

  it("sin nada que contar (todo a cero), NO manda el correo — un resumen vacío es ruido", async () => {
    userFindMany.mockResolvedValue([{ id: "u1", email: "ana@example.com", personalWorkspaceId: "ws1" }]);
    const { enviarResumenSemanal } = await import("../src/lib/weeklyDigest");

    const resultado = await enviarResumenSemanal("https://memoriable.example", AHORA);

    expect(sendWeeklyDigestEmail).not.toHaveBeenCalled();
    expect(resultado).toEqual({ elegibles: 1, enviados: 0 });
  });

  it("un fallo con un usuario no bloquea el resto de la lista", async () => {
    userFindMany.mockResolvedValue([
      { id: "u1", email: "falla@example.com", personalWorkspaceId: "ws1" },
      { id: "u2", email: "ana@example.com", personalWorkspaceId: "ws2" },
    ]);
    resolveAmbientStats
      .mockRejectedValueOnce(new Error("BD caída"))
      .mockResolvedValueOnce({ pendientesCount: 1, vencidasCount: 0, eventosProximos: [], eventosProximosCount: 0 });
    const { enviarResumenSemanal } = await import("../src/lib/weeklyDigest");

    const resultado = await enviarResumenSemanal("https://memoriable.example", AHORA);

    expect(sendWeeklyDigestEmail).toHaveBeenCalledOnce();
    expect(resultado).toEqual({ elegibles: 2, enviados: 1 });
  });

  it("si el envío del correo falla, no cuenta como enviado", async () => {
    userFindMany.mockResolvedValue([{ id: "u1", email: "ana@example.com", personalWorkspaceId: "ws1" }]);
    resolveAmbientStats.mockResolvedValue({ pendientesCount: 1, vencidasCount: 0, eventosProximos: [], eventosProximosCount: 0 });
    sendWeeklyDigestEmail.mockResolvedValue(false);
    const { enviarResumenSemanal } = await import("../src/lib/weeklyDigest");

    const resultado = await enviarResumenSemanal("https://memoriable.example", AHORA);

    expect(resultado).toEqual({ elegibles: 1, enviados: 0 });
  });
});
