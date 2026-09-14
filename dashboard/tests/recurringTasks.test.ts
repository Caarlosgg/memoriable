import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const refrescarEmbedding = vi.fn();
vi.mock("@/lib/pipeline", () => ({ refrescarEmbedding: (...a: unknown[]) => refrescarEmbedding(...a) }));

const findUnique = vi.fn();
const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
    },
  },
}));

const TAREA_BASE = {
  serieId: "s1",
  serieFrecuencia: "SEMANAL",
  serieIndice: 0,
  serieVeces: 3,
  userId: "u1",
  workspaceId: "ws1",
  tipo: "text",
  contenido: "Sacar la basura",
  categoria: "tarea",
  customCategoryId: null,
  resumen: "Sacar la basura",
  etiquetas: ["casa"],
  camposExtra: {},
  checklist: [{ id: "c1", texto: "Bajar la bolsa", hecho: true }],
  assigneeId: null,
  fechaLimite: new Date("2026-09-01T00:00:00.000Z"),
};

describe("spawnSiguienteOcurrencia", () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
    create.mockResolvedValue({ id: "m2" });
    refrescarEmbedding.mockReset();
  });

  it("nota normal (sin serie): no crea nada", async () => {
    findUnique.mockResolvedValue({ ...TAREA_BASE, serieId: null, serieFrecuencia: null, serieIndice: null, serieVeces: null });
    const { spawnSiguienteOcurrencia } = await import("../src/lib/recurringTasks");

    await spawnSiguienteOcurrencia("m1");

    expect(create).not.toHaveBeenCalled();
  });

  it("mitad de la serie: crea la siguiente con la fecha desplazada, el índice al día, y reinicia el checklist", async () => {
    findUnique.mockResolvedValue(TAREA_BASE);
    const { spawnSiguienteOcurrencia } = await import("../src/lib/recurringTasks");

    await spawnSiguienteOcurrencia("m1");

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        workspaceId: "ws1",
        tipo: "text",
        contenido: "Sacar la basura",
        categoria: "tarea",
        customCategoryId: null,
        resumen: "Sacar la basura",
        etiquetas: ["casa"],
        camposExtra: {},
        checklist: [{ id: "c1", texto: "Bajar la bolsa", hecho: false }],
        assigneeId: null,
        fechaLimite: new Date("2026-09-08T00:00:00.000Z"), // +1 semana
        serieId: "s1",
        serieFrecuencia: "SEMANAL",
        serieIndice: 1,
        serieVeces: 3,
      },
    });
    expect(refrescarEmbedding).toHaveBeenCalledWith("m2", "Sacar la basura");
  });

  it("sin fechaLimite en la completada, usa 'ahora' como base", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    findUnique.mockResolvedValue({ ...TAREA_BASE, fechaLimite: null });
    const { spawnSiguienteOcurrencia } = await import("../src/lib/recurringTasks");

    await spawnSiguienteOcurrencia("m1");

    const data = create.mock.calls[0]![0].data;
    expect(data.fechaLimite).toEqual(new Date("2026-09-17T12:00:00.000Z"));
    vi.useRealTimers();
  });

  it("serie ya agotada (última ocurrencia): no crea una más", async () => {
    findUnique.mockResolvedValue({ ...TAREA_BASE, serieIndice: 2, serieVeces: 3 });
    const { spawnSiguienteOcurrencia } = await import("../src/lib/recurringTasks");

    await spawnSiguienteOcurrencia("m1");

    expect(create).not.toHaveBeenCalled();
  });

  it("mensaje que ya no existe: no lanza, no crea nada", async () => {
    findUnique.mockResolvedValue(null);
    const { spawnSiguienteOcurrencia } = await import("../src/lib/recurringTasks");

    await expect(spawnSiguienteOcurrencia("fantasma")).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("si falla la consulta, no lanza (best-effort)", async () => {
    findUnique.mockRejectedValue(new Error("BD caída"));
    const { spawnSiguienteOcurrencia } = await import("../src/lib/recurringTasks");

    await expect(spawnSiguienteOcurrencia("m1")).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});
