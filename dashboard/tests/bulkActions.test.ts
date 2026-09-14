import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn();
const isActiveMember = vi.fn();
vi.mock("@/lib/workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace")>()),
  getActiveWorkspace: () => getActiveWorkspace(),
  isActiveMember: (...a: unknown[]) => isActiveMember(...a),
}));

const updateMany = vi.fn();
const deleteMany = vi.fn();
const executeRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
  },
}));

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", role: "OWNER", isPersonal: false });
  isActiveMember.mockReset();
  isActiveMember.mockResolvedValue(true);
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 3 });
  deleteMany.mockReset();
  deleteMany.mockResolvedValue({ count: 2 });
  executeRaw.mockReset();
  executeRaw.mockResolvedValue(2);
});

describe("bulkRecategorize", () => {
  it("cambia varias de una vez: recategorizar 20 notas eran ~80 clics", async () => {
    const { bulkRecategorize } = await import("@/app/(dashboard)/actions");

    expect(await bulkRecategorize(["a", "b", "c"], "tarea")).toEqual({ afectadas: 3 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b", "c"] }, workspaceId: "ws1" },
      data: { categoria: "tarea" },
    });
  });

  it("el alcance va en el WHERE: un id ajeno colado en la lista no coincide", async () => {
    // Es lo que hace que no dependa de que un bucle compruebe bien cada id.
    const { bulkRecategorize } = await import("@/app/(dashboard)/actions");
    await bulkRecategorize(["ajeno"], "nota");

    expect(updateMany.mock.calls[0]![0]).toMatchObject({ where: { workspaceId: "ws1" } });
  });

  it("rechaza una categoría inventada", async () => {
    const { bulkRecategorize } = await import("@/app/(dashboard)/actions");

    expect((await bulkRecategorize(["a"], "inventada")).error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("una lista vacía no consulta nada", async () => {
    const { bulkRecategorize } = await import("@/app/(dashboard)/actions");

    expect(await bulkRecategorize([], "tarea")).toEqual({ afectadas: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("hay tope: una petición manipulada no puede reescribir el workspace entero", async () => {
    const muchos = Array.from({ length: 201 }, (_, i) => `id${i}`);
    const { bulkRecategorize } = await import("@/app/(dashboard)/actions");

    expect((await bulkRecategorize(muchos, "tarea")).error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("un rol de solo lectura no cambia nada", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", role: "VIEWER", isPersonal: false });
    const { bulkRecategorize } = await import("@/app/(dashboard)/actions");

    expect((await bulkRecategorize(["a"], "tarea")).error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("bulkDelete", () => {
  it("borra varias de una vez, con el alcance en el where", async () => {
    const { bulkDelete } = await import("@/app/(dashboard)/actions");

    expect(await bulkDelete(["a", "b"])).toEqual({ afectadas: 2 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] }, workspaceId: "ws1" } });
  });

  it("un rol de solo lectura no borra nada", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", role: "VIEWER", isPersonal: false });
    const { bulkDelete } = await import("@/app/(dashboard)/actions");

    expect((await bulkDelete(["a"])).error).toBeTruthy();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("también tiene tope", async () => {
    const muchos = Array.from({ length: 500 }, (_, i) => `id${i}`);
    const { bulkDelete } = await import("@/app/(dashboard)/actions");

    expect((await bulkDelete(muchos)).error).toBeTruthy();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("bulkAddEtiqueta", () => {
  it("añade la etiqueta con array_append, con guarda contra duplicados", async () => {
    const { bulkAddEtiqueta } = await import("@/app/(dashboard)/actions");

    expect(await bulkAddEtiqueta(["a", "b"], "  urgente  ")).toEqual({ afectadas: 2 });
    expect(executeRaw).toHaveBeenCalledOnce();
    // La etiqueta va recortada, y aparece DOS veces: una para el valor que
    // se añade, otra para la guarda "NOT (... = ANY(etiquetas))" que evita
    // duplicarla en una nota que ya la tuviera.
    const valores = executeRaw.mock.calls[0]!.slice(1);
    expect(valores).toEqual(["urgente", ["a", "b"], "ws1", "urgente"]);
  });

  it("rechaza una etiqueta vacía, sin tocar la base de datos", async () => {
    const { bulkAddEtiqueta } = await import("@/app/(dashboard)/actions");

    expect((await bulkAddEtiqueta(["a"], "   ")).error).toBeTruthy();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("rechaza una etiqueta demasiado larga", async () => {
    const { bulkAddEtiqueta } = await import("@/app/(dashboard)/actions");

    expect((await bulkAddEtiqueta(["a"], "x".repeat(41))).error).toBeTruthy();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("una lista vacía no consulta nada", async () => {
    const { bulkAddEtiqueta } = await import("@/app/(dashboard)/actions");

    expect(await bulkAddEtiqueta([], "urgente")).toEqual({ afectadas: 0 });
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("un rol de solo lectura no etiqueta nada", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", role: "VIEWER", isPersonal: false });
    const { bulkAddEtiqueta } = await import("@/app/(dashboard)/actions");

    expect((await bulkAddEtiqueta(["a"], "urgente")).error).toBeTruthy();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("también tiene tope", async () => {
    const muchos = Array.from({ length: 201 }, (_, i) => `id${i}`);
    const { bulkAddEtiqueta } = await import("@/app/(dashboard)/actions");

    expect((await bulkAddEtiqueta(muchos, "urgente")).error).toBeTruthy();
    expect(executeRaw).not.toHaveBeenCalled();
  });
});

describe("bulkAssign", () => {
  it("asigna varias de una vez, con el alcance en el where", async () => {
    const { bulkAssign } = await import("@/app/(dashboard)/actions");

    expect(await bulkAssign(["a", "b"], "maria")).toEqual({ afectadas: 3 });
    expect(isActiveMember).toHaveBeenCalledWith("maria", "ws1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] }, workspaceId: "ws1" },
      data: { assigneeId: "maria" },
    });
  });

  it("quitar la asignación (assigneeId null) no comprueba membresía", async () => {
    const { bulkAssign } = await import("@/app/(dashboard)/actions");

    await bulkAssign(["a"], null);
    expect(isActiveMember).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a"] }, workspaceId: "ws1" },
      data: { assigneeId: null },
    });
  });

  it("rechaza asignar a alguien que no es miembro del workspace", async () => {
    isActiveMember.mockResolvedValue(false);
    const { bulkAssign } = await import("@/app/(dashboard)/actions");

    expect((await bulkAssign(["a"], "ajeno")).error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("un rol de solo lectura no asigna nada", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", role: "VIEWER", isPersonal: false });
    const { bulkAssign } = await import("@/app/(dashboard)/actions");

    expect((await bulkAssign(["a"], "maria")).error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("también tiene tope", async () => {
    const muchos = Array.from({ length: 500 }, (_, i) => `id${i}`);
    const { bulkAssign } = await import("@/app/(dashboard)/actions");

    expect((await bulkAssign(muchos, "maria")).error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
