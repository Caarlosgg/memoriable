import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: async () => ({ workspaceId: "ws1", isPersonal: false, role: "ADMIN" }),
  isActiveMember: async () => true,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/pipeline", () => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/quickSearch", () => ({ searchAcrossAll: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

const campoTemplateFindUnique = vi.fn();
const campoTemplateUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    campoTemplate: {
      findUnique: (...args: unknown[]) => campoTemplateFindUnique(...args),
      upsert: (...args: unknown[]) => campoTemplateUpsert(...args),
    },
  },
}));

beforeEach(() => {
  campoTemplateFindUnique.mockReset();
  campoTemplateUpsert.mockReset();
});

describe("getCampoTemplate", () => {
  it("devuelve un array vacío si no hay plantilla guardada para esa categoría", async () => {
    campoTemplateFindUnique.mockResolvedValue(null);
    const { getCampoTemplate } = await import("../src/app/(dashboard)/actions");
    const result = await getCampoTemplate("tarea");
    expect(result).toEqual([]);
    expect(campoTemplateFindUnique).toHaveBeenCalledWith({
      where: { workspaceId_categoria: { workspaceId: "ws1", categoria: "tarea" } },
      select: { campos: true },
    });
  });

  it("convierte la plantilla guardada a array editable", async () => {
    campoTemplateFindUnique.mockResolvedValue({ campos: { Empresa: { tipo: "texto" }, Presupuesto: { tipo: "numero" } } });
    const { getCampoTemplate } = await import("../src/app/(dashboard)/actions");
    const result = await getCampoTemplate("nota");
    expect(result).toEqual([
      { nombre: "Empresa", tipo: "texto" },
      { nombre: "Presupuesto", tipo: "numero" },
    ]);
  });
});

describe("saveCampoTemplate", () => {
  it("rechaza guardar una plantilla vacía", async () => {
    const { saveCampoTemplate } = await import("../src/app/(dashboard)/actions");
    const result = await saveCampoTemplate("tarea", []);
    expect(result.error).toMatch(/al menos un campo/);
    expect(campoTemplateUpsert).not.toHaveBeenCalled();
  });

  it("hace upsert de la plantilla por (workspace, categoría)", async () => {
    const { saveCampoTemplate } = await import("../src/app/(dashboard)/actions");
    const result = await saveCampoTemplate("cliente", [{ nombre: "Empresa", tipo: "texto" }]);
    expect(result.error).toBeUndefined();
    expect(campoTemplateUpsert).toHaveBeenCalledWith({
      where: { workspaceId_categoria: { workspaceId: "ws1", categoria: "cliente" } },
      create: { workspaceId: "ws1", categoria: "cliente", campos: { Empresa: { tipo: "texto" } } },
      update: { campos: { Empresa: { tipo: "texto" } } },
    });
  });

  it("devuelve un error genérico si falla la escritura", async () => {
    campoTemplateUpsert.mockRejectedValue(new Error("boom"));
    const { saveCampoTemplate } = await import("../src/app/(dashboard)/actions");
    const result = await saveCampoTemplate("cliente", [{ nombre: "Empresa", tipo: "texto" }]);
    expect(result.error).toMatch(/No se ha podido guardar/);
  });
});
