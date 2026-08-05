import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const eventoCreate = vi.fn();
const eventoUpdateMany = vi.fn();
const eventoDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    evento: {
      create: (...args: unknown[]) => eventoCreate(...args),
      updateMany: (...args: unknown[]) => eventoUpdateMany(...args),
      deleteMany: (...args: unknown[]) => eventoDeleteMany(...args),
    },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const baseInput = {
  titulo: "Cita con el médico",
  fechaInicio: "2026-08-12T10:00:00.000Z",
  participantes: [] as string[],
};

describe("createEvento", () => {
  beforeEach(() => {
    eventoCreate.mockReset();
    eventoCreate.mockResolvedValue({ id: "e1" });
    revalidatePath.mockReset();
  });

  it("rechaza un título vacío (o solo espacios) sin tocar la base de datos", async () => {
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await createEvento({ ...baseInput, titulo: "   " });
    expect(result.error).toMatch(/título/);
    expect(eventoCreate).not.toHaveBeenCalled();
  });

  it("rechaza una fecha de inicio que no se puede interpretar", async () => {
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await createEvento({ ...baseInput, fechaInicio: "no-es-una-fecha" });
    expect(result.error).toMatch(/fecha de inicio/);
    expect(eventoCreate).not.toHaveBeenCalled();
  });

  it("rechaza una fecha de fin anterior a la de inicio", async () => {
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await createEvento({
      ...baseInput,
      fechaInicio: "2026-08-12T10:00:00.000Z",
      fechaFin: "2026-08-12T09:00:00.000Z",
    });
    expect(result.error).toMatch(/fin no puede ser antes/);
    expect(eventoCreate).not.toHaveBeenCalled();
  });

  it("crea el evento ligado al usuario de la sesión e invalida /calendario", async () => {
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await createEvento(baseInput);

    expect(result.error).toBeUndefined();
    expect(eventoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", titulo: "Cita con el médico" }) }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("recorta espacios sobrantes del título", async () => {
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    await createEvento({ ...baseInput, titulo: "  Cita  " });
    expect(eventoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ titulo: "Cita" }) }),
    );
  });

  it("un fallo al guardar se traduce a un mensaje genérico en español", async () => {
    eventoCreate.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await createEvento(baseInput);
    expect(result.error).toMatch(/No se ha podido guardar/);
  });
});

describe("updateEvento", () => {
  beforeEach(() => {
    eventoUpdateMany.mockReset();
    eventoUpdateMany.mockResolvedValue({ count: 1 });
    revalidatePath.mockReset();
  });

  it("actualiza solo si el evento pertenece al usuario (updateMany con userId en el where)", async () => {
    const { updateEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await updateEvento("e1", baseInput);
    expect(result.error).toBeUndefined();
    expect(eventoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1", userId: "u1" } }),
    );
  });

  it("devuelve error si no se encontró el evento (count 0 — no pertenece al usuario, o no existe)", async () => {
    eventoUpdateMany.mockResolvedValue({ count: 0 });
    const { updateEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await updateEvento("e-ajeno", baseInput);
    expect(result.error).toMatch(/No se ha encontrado el evento/);
  });

  it("valida igual que createEvento antes de tocar la base de datos", async () => {
    const { updateEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await updateEvento("e1", { ...baseInput, titulo: "" });
    expect(result.error).toMatch(/título/);
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });
});

describe("deleteEvento", () => {
  it("borra solo si el evento pertenece al usuario (deleteMany con userId en el where)", async () => {
    eventoDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await deleteEvento("e1");
    expect(result.error).toBeUndefined();
    expect(eventoDeleteMany).toHaveBeenCalledWith({ where: { id: "e1", userId: "u1" } });
  });
});
