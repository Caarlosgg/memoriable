import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: (...args: unknown[]) => userUpdate(...args) },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

describe("saveBoardFilters", () => {
  beforeEach(() => {
    userUpdate.mockReset();
    userUpdate.mockResolvedValue({});
  });

  it("guarda los filtros del tablero ligados al usuario de la sesión", async () => {
    const { saveBoardFilters } = await import("../src/app/(dashboard)/actions");
    await saveBoardFilters({ categoria: "tarea", prioridad: "ALTA" });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { preferenciasTablero: { categoria: "tarea", prioridad: "ALTA" } },
    });
  });

  it("acepta filtros vacíos (al quitar el filtro)", async () => {
    const { saveBoardFilters } = await import("../src/app/(dashboard)/actions");
    await saveBoardFilters({});

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { preferenciasTablero: {} } });
  });

  it("un fallo al guardar no lanza (best-effort, no crítico)", async () => {
    userUpdate.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { saveBoardFilters } = await import("../src/app/(dashboard)/actions");

    await expect(saveBoardFilters({ categoria: "idea" })).resolves.toBeUndefined();
  });
});
