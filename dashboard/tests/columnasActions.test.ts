import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn();
const getBoardLabels = vi.fn();
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
  getBoardLabels: (...a: unknown[]) => getBoardLabels(...a),
}));

const boardStatusCount = vi.fn();
const boardStatusCreateMany = vi.fn();
const boardStatusCreate = vi.fn();
const boardStatusUpdateMany = vi.fn();
const boardStatusFindFirst = vi.fn();
const boardStatusDelete = vi.fn();
const boardStatusFindMany = vi.fn();
const boardStatusUpdate = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    boardStatus: {
      count: (...a: unknown[]) => boardStatusCount(...a),
      createMany: (...a: unknown[]) => boardStatusCreateMany(...a),
      create: (...a: unknown[]) => boardStatusCreate(...a),
      updateMany: (...a: unknown[]) => boardStatusUpdateMany(...a),
      findFirst: (...a: unknown[]) => boardStatusFindFirst(...a),
      delete: (...a: unknown[]) => boardStatusDelete(...a),
      findMany: (...a: unknown[]) => boardStatusFindMany(...a),
      // Usado DENTRO del `.map()` de reorderBoardColumns antes de llegar a
      // `$transaction` — sin este mock, ese `.map()` ya lanza.
      update: (...a: unknown[]) => boardStatusUpdate(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "MEMBER" });
  getBoardLabels.mockReset();
  getBoardLabels.mockResolvedValue({});
  boardStatusCount.mockReset();
  boardStatusCreateMany.mockReset();
  boardStatusCreate.mockReset();
  boardStatusUpdateMany.mockReset();
  boardStatusUpdateMany.mockResolvedValue({ count: 1 });
  boardStatusFindFirst.mockReset();
  boardStatusDelete.mockReset();
  boardStatusFindMany.mockReset();
  boardStatusFindMany.mockResolvedValue([]);
  boardStatusUpdate.mockReset();
  transaction.mockReset();
  transaction.mockResolvedValue([]);
});

describe("createBoardColumn", () => {
  it("rechaza con rol de solo lectura, sin tocar la base de datos", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { createBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await createBoardColumn("Backlog", "POR_HACER");

    expect(result.error).toMatch(/solo lectura/);
    expect(boardStatusCreate).not.toHaveBeenCalled();
  });

  it("rechaza un nombre vacío o solo espacios", async () => {
    const { createBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");
    const result = await createBoardColumn("   ", "POR_HACER");

    expect(result.error).toMatch(/ponle un nombre/i);
    expect(boardStatusCreate).not.toHaveBeenCalled();
  });

  it("rechaza una fase que no existe en el enum", async () => {
    const { createBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");
    const result = await createBoardColumn("Backlog", "INVENTADA" as never);

    expect(result.error).toMatch(/esa fase no existe/i);
    expect(boardStatusCreate).not.toHaveBeenCalled();
  });

  it("rechaza crear una novena columna — el tope es 8", async () => {
    boardStatusCount.mockResolvedValue(8);
    const { createBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await createBoardColumn("Backlog", "POR_HACER");

    expect(result.error).toMatch(/no puedes tener más de 8/i);
    expect(boardStatusCreate).not.toHaveBeenCalled();
  });

  it("al crear la PRIMERA columna propia, materializa las tres por defecto antes de la nueva", async () => {
    boardStatusCount.mockResolvedValue(0);
    boardStatusCreate.mockResolvedValue({ id: "nueva" });
    const { createBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    await createBoardColumn("Backlog", "POR_HACER");

    // Las tres de siempre entran con orden 0/1/2, la nueva se añade DETRÁS (orden 3).
    expect(boardStatusCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ orden: 0, fase: "POR_HACER" }),
          expect.objectContaining({ orden: 1, fase: "EN_PROGRESO" }),
          expect.objectContaining({ orden: 2, fase: "HECHO" }),
        ],
      }),
    );
    expect(boardStatusCreate).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", nombre: "Backlog", orden: 3, fase: "POR_HACER" },
    });
  });

  it("con columnas propias ya existentes, NO vuelve a materializar las tres por defecto", async () => {
    boardStatusCount.mockResolvedValue(2);
    const { createBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    await createBoardColumn("Otra más", "EN_PROGRESO");

    expect(boardStatusCreateMany).not.toHaveBeenCalled();
    expect(boardStatusCreate).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", nombre: "Otra más", orden: 2, fase: "EN_PROGRESO" },
    });
  });
});

describe("renameBoardColumn", () => {
  it("rechaza con rol de solo lectura", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { renameBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await renameBoardColumn("c1", "Nuevo nombre");

    expect(result.error).toMatch(/solo lectura/);
    expect(boardStatusUpdateMany).not.toHaveBeenCalled();
  });

  it("filtra por workspaceId además del id — un id de otro tablero no toca nada", async () => {
    const { renameBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");
    await renameBoardColumn("c-ajena", "Nuevo nombre");

    expect(boardStatusUpdateMany).toHaveBeenCalledWith({
      where: { id: "c-ajena", workspaceId: "ws1" },
      data: { nombre: "Nuevo nombre" },
    });
  });

  it("si no coincide ninguna fila, dice que la columna no existe (en vez de un éxito silencioso)", async () => {
    boardStatusUpdateMany.mockResolvedValue({ count: 0 });
    const { renameBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await renameBoardColumn("c-ajena", "Nuevo nombre");

    expect(result.error).toMatch(/no existe en este tablero/i);
  });
});

describe("deleteBoardColumn", () => {
  it("rechaza con rol de solo lectura", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { deleteBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await deleteBoardColumn("c1");

    expect(result.error).toMatch(/solo lectura/);
    expect(boardStatusDelete).not.toHaveBeenCalled();
  });

  it("no deja borrar la única columna de una fase — el tablero se quedaría sin sitio para esa fase", async () => {
    boardStatusFindFirst.mockResolvedValue({ id: "c1", workspaceId: "ws1", fase: "HECHO" });
    boardStatusCount.mockResolvedValue(1);
    const { deleteBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await deleteBoardColumn("c1");

    expect(result.error).toMatch(/única columna/i);
    expect(boardStatusDelete).not.toHaveBeenCalled();
  });

  it("borra sin problema si hay más de una columna en esa fase", async () => {
    boardStatusFindFirst.mockResolvedValue({ id: "c1", workspaceId: "ws1", fase: "EN_PROGRESO" });
    boardStatusCount.mockResolvedValue(2);
    const { deleteBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await deleteBoardColumn("c1");

    expect(result.error).toBeUndefined();
    expect(boardStatusDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("una columna que no existe en este workspace no lanza ni intenta borrar", async () => {
    boardStatusFindFirst.mockResolvedValue(null);
    const { deleteBoardColumn } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await deleteBoardColumn("c-ajena");

    expect(result.error).toMatch(/no existe en este tablero/i);
    expect(boardStatusDelete).not.toHaveBeenCalled();
  });
});

describe("reorderBoardColumns", () => {
  it("rechaza con rol de solo lectura", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { reorderBoardColumns } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await reorderBoardColumns(["c1", "c2"]);

    expect(result.error).toMatch(/solo lectura/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rechaza una lista parcial — aceptarla dejaría huecos de orden", async () => {
    boardStatusFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);
    const { reorderBoardColumns } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await reorderBoardColumns(["c1", "c2"]);

    expect(result.error).toMatch(/no coincide/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rechaza una lista con un id que no es de este tablero", async () => {
    boardStatusFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    const { reorderBoardColumns } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await reorderBoardColumns(["c1", "c-ajena"]);

    expect(result.error).toMatch(/no coincide/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("con una reordenación completa, guarda el índice de cada una como su `orden`", async () => {
    boardStatusFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);
    const { reorderBoardColumns } = await import("../src/app/(dashboard)/columnas/actions");

    const result = await reorderBoardColumns(["c3", "c1", "c2"]);

    expect(result.error).toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    const updates = transaction.mock.calls[0]![0];
    expect(updates).toHaveLength(3);
  });
});
