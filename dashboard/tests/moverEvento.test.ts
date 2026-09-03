import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn();
vi.mock("@/lib/workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace")>()),
  getActiveWorkspace: () => getActiveWorkspace(),
}));

const eventoFindFirst = vi.fn();
const eventoUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    evento: {
      findFirst: (...a: unknown[]) => eventoFindFirst(...a),
      updateMany: (...a: unknown[]) => eventoUpdateMany(...a),
    },
  },
}));

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", role: "OWNER", isPersonal: false });
  eventoFindFirst.mockReset();
  eventoFindFirst.mockResolvedValue({
    fechaInicio: new Date("2026-09-03T10:00:00.000Z"),
    fechaFin: new Date("2026-09-03T11:30:00.000Z"),
  });
  eventoUpdateMany.mockReset();
  eventoUpdateMany.mockResolvedValue({ count: 1 });
});

describe("moverEvento", () => {
  it("conserva la hora y la duración al cambiar de día", async () => {
    // Arrastrar una reunión al día siguiente no puede convertirla en otra
    // cosa: sigue siendo de 10:00 a 11:30.
    const { moverEvento } = await import("@/app/(dashboard)/calendario/actions");

    expect(await moverEvento("ev1", 1)).toEqual({});
    expect(eventoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fechaInicio: new Date("2026-09-04T10:00:00.000Z"),
          fechaFin: new Date("2026-09-04T11:30:00.000Z"),
        },
      }),
    );
  });

  it("mueve hacia atrás con días negativos", async () => {
    const { moverEvento } = await import("@/app/(dashboard)/calendario/actions");
    await moverEvento("ev1", -2);

    expect(eventoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fechaInicio: new Date("2026-09-01T10:00:00.000Z") }),
      }),
    );
  });

  it("un evento sin fechaFin no se inventa una", async () => {
    eventoFindFirst.mockResolvedValue({ fechaInicio: new Date("2026-09-03T10:00:00.000Z"), fechaFin: null });
    const { moverEvento } = await import("@/app/(dashboard)/calendario/actions");
    await moverEvento("ev1", 1);

    expect(eventoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { fechaInicio: new Date("2026-09-04T10:00:00.000Z") } }),
    );
  });

  it("rechaza un desplazamiento absurdo: el cliente lo calcula y un bug mandaría el evento a otro siglo", async () => {
    const { moverEvento } = await import("@/app/(dashboard)/calendario/actions");

    expect((await moverEvento("ev1", 100000)).error).toBeTruthy();
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("mover cero días no es un movimiento", async () => {
    const { moverEvento } = await import("@/app/(dashboard)/calendario/actions");
    expect((await moverEvento("ev1", 0)).error).toBeTruthy();
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("un rol de solo lectura no puede mover nada", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", role: "VIEWER", isPersonal: false });
    const { moverEvento } = await import("@/app/(dashboard)/calendario/actions");

    expect((await moverEvento("ev1", 1)).error).toBeTruthy();
    expect(eventoFindFirst).not.toHaveBeenCalled();
  });

  it("un evento de otro workspace no se encuentra: el alcance va en el where", async () => {
    eventoFindFirst.mockResolvedValue(null);
    const { moverEvento } = await import("@/app/(dashboard)/calendario/actions");

    expect((await moverEvento("ajeno", 1)).error).toBeTruthy();
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });
});
