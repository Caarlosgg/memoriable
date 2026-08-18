import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
const messageGroupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findMany: (...args: unknown[]) => messageFindMany(...args),
      groupBy: (...args: unknown[]) => messageGroupBy(...args),
    },
  },
}));

const AHORA = new Date();
const ayer = new Date(AHORA.getTime() - 24 * 60 * 60 * 1000);
const manana = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);

beforeEach(() => {
  messageFindMany.mockReset();
  messageFindMany.mockResolvedValue([]);
  messageGroupBy.mockReset();
  messageGroupBy.mockResolvedValue([]);
});

describe("getTeamWorkload", () => {
  it("solo cuenta lo ABIERTO como carga — lo ya hecho no pesa sobre nadie", async () => {
    const { getTeamWorkload } = await import("../src/lib/teamWorkload");
    await getTeamWorkload("ws1");

    const { where } = messageFindMany.mock.calls[0]![0];
    expect(where.workspaceId).toBe("ws1");
    expect(where.estado).toEqual({ in: ["POR_HACER", "EN_PROGRESO"] });
  });

  it("separa pendientes de en progreso, y suma las dos como carga abierta", async () => {
    messageFindMany.mockResolvedValue([
      { assigneeId: "u1", estado: "POR_HACER", fechaLimite: null },
      { assigneeId: "u1", estado: "EN_PROGRESO", fechaLimite: null },
      { assigneeId: "u1", estado: "POR_HACER", fechaLimite: null },
    ]);
    const { getTeamWorkload } = await import("../src/lib/teamWorkload");
    const carga = await getTeamWorkload("ws1");

    const u1 = carga.porMiembro.get("u1")!;
    expect(u1.pendientes).toBe(2);
    expect(u1.enProgreso).toBe(1);
    expect(u1.abiertas).toBe(3);
  });

  it("las vencidas son un SUBCONJUNTO de las abiertas, no una categoría aparte", async () => {
    // Si se contaran aparte, el tramo rojo de la barra podría pasarse del
    // ancho total de la persona (ver TeamWorkload.tsx).
    messageFindMany.mockResolvedValue([
      { assigneeId: "u1", estado: "POR_HACER", fechaLimite: ayer },
      { assigneeId: "u1", estado: "POR_HACER", fechaLimite: manana },
    ]);
    const { getTeamWorkload } = await import("../src/lib/teamWorkload");
    const carga = await getTeamWorkload("ws1");

    const u1 = carga.porMiembro.get("u1")!;
    expect(u1.abiertas).toBe(2);
    expect(u1.vencidas).toBe(1);
    expect(u1.vencidas).toBeLessThanOrEqual(u1.abiertas);
  });

  it("lo que no lleva nadie se cuenta aparte, no se reparte entre el equipo", async () => {
    messageFindMany.mockResolvedValue([
      { assigneeId: null, estado: "POR_HACER", fechaLimite: null },
      { assigneeId: null, estado: "POR_HACER", fechaLimite: ayer },
      { assigneeId: "u1", estado: "POR_HACER", fechaLimite: null },
    ]);
    const { getTeamWorkload } = await import("../src/lib/teamWorkload");
    const carga = await getTeamWorkload("ws1");

    expect(carga.sinAsignar).toBe(2);
    expect(carga.porMiembro.get("u1")!.abiertas).toBe(1);
    // Las vencidas del equipo incluyen las de nadie: son problema igual.
    expect(carga.totalVencidas).toBe(1);
  });

  it("la escala de las barras es la persona más cargada, nunca 0 (evita dividir por cero)", async () => {
    const { getTeamWorkload } = await import("../src/lib/teamWorkload");
    const vacio = await getTeamWorkload("ws1");
    expect(vacio.maxAbiertasPorPersona).toBe(1);

    messageFindMany.mockResolvedValue([
      { assigneeId: "u1", estado: "POR_HACER", fechaLimite: null },
      { assigneeId: "u1", estado: "POR_HACER", fechaLimite: null },
      { assigneeId: "u2", estado: "POR_HACER", fechaLimite: null },
    ]);
    const { getTeamWorkload: recargado } = await import("../src/lib/teamWorkload");
    const carga = await recargado("ws1");
    expect(carga.maxAbiertasPorPersona).toBe(2);
  });

  it("cuenta las cerradas de la última semana por persona, sin mezclarlas con la carga", async () => {
    messageFindMany.mockResolvedValue([{ assigneeId: "u1", estado: "POR_HACER", fechaLimite: null }]);
    messageGroupBy.mockResolvedValue([{ assigneeId: "u1", _count: { _all: 4 } }]);
    const { getTeamWorkload } = await import("../src/lib/teamWorkload");
    const carga = await getTeamWorkload("ws1");

    const u1 = carga.porMiembro.get("u1")!;
    expect(u1.completadasSemana).toBe(4);
    expect(u1.abiertas).toBe(1);
  });
});
