import { describe, expect, it, vi, beforeEach } from "vitest";

// Ver el comentario en assistantTools.test.ts: @sentry/nextjs real es
// pesado de importar y llegó a hacer que tests de otros archivos superasen
// su timeout bajo la suite completa. Se mockea (regla 3 de CLAUDE.md).
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

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
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
  });

  it("rechaza crear con rol VIEWER, sin tocar la base de datos", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await createEvento(baseInput);
    expect(result.error).toMatch(/solo lectura/);
    expect(eventoCreate).not.toHaveBeenCalled();
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
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", workspaceId: "ws1", titulo: "Cita con el médico" }),
      }),
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

  it("con repetir crea toda la serie en una sola llamada, en fechas distintas", async () => {
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await createEvento({
      ...baseInput,
      fechaInicio: "2026-08-06T09:00:00.000Z",
      repetir: { frecuencia: "SEMANAL", veces: 5 },
    });
    expect(result.error).toBeUndefined();
    expect(eventoCreate).toHaveBeenCalledTimes(5);
    const fechas = eventoCreate.mock.calls.map((c) => c[0].data.fechaInicio.toISOString());
    expect(fechas).toEqual([
      "2026-08-06T09:00:00.000Z",
      "2026-08-13T09:00:00.000Z",
      "2026-08-20T09:00:00.000Z",
      "2026-08-27T09:00:00.000Z",
      "2026-09-03T09:00:00.000Z",
    ]);
  });

  it("sin repetir crea una única fila", async () => {
    const { createEvento } = await import("../src/app/(dashboard)/calendario/actions");
    await createEvento(baseInput);
    expect(eventoCreate).toHaveBeenCalledTimes(1);
  });
});

describe("updateEvento", () => {
  beforeEach(() => {
    eventoUpdateMany.mockReset();
    eventoUpdateMany.mockResolvedValue({ count: 1 });
    revalidatePath.mockReset();
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
  });

  it("rechaza editar con rol VIEWER, sin tocar la base de datos", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { updateEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await updateEvento("e1", baseInput);
    expect(result.error).toMatch(/solo lectura/);
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("actualiza solo si el evento pertenece al workspace activo (updateMany con workspaceId en el where)", async () => {
    const { updateEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await updateEvento("e1", baseInput);
    expect(result.error).toBeUndefined();
    expect(eventoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1", workspaceId: "ws1" } }),
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
  beforeEach(() => {
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
  });

  it("rechaza borrar con rol VIEWER, sin tocar la base de datos", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { deleteEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await deleteEvento("e1");
    expect(result.error).toMatch(/solo lectura/);
    expect(eventoDeleteMany).not.toHaveBeenCalled();
  });

  it("borra solo si el evento pertenece al workspace activo (deleteMany con workspaceId en el where)", async () => {
    eventoDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteEvento } = await import("../src/app/(dashboard)/calendario/actions");
    const result = await deleteEvento("e1");
    expect(result.error).toBeUndefined();
    expect(eventoDeleteMany).toHaveBeenCalledWith({ where: { id: "e1", workspaceId: "ws1" } });
  });
});
