import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args) }));

let nextId = 0;
const captureMessage = vi.fn(async (..._args: unknown[]) => ({ id: `m${++nextId}` }));
vi.mock("@/lib/pipeline", () => ({ captureMessage: (...args: unknown[]) => captureMessage(...args) }));

const messageUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { message: { update: (...args: unknown[]) => messageUpdate(...args) } },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

function mdFile(name: string, contenido: string): File {
  return new File([contenido], name, { type: "text/markdown" });
}

function filesFormData(files: File[]): FormData {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return fd;
}

describe("importMarkdownFiles", () => {
  beforeEach(() => {
    nextId = 0;
    captureMessage.mockClear();
    messageUpdate.mockReset();
    messageUpdate.mockResolvedValue({});
    revalidatePath.mockReset();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
  });

  it("importa un fichero .md suelto sin frontmatter, sin tocar la nota después de crearla", async () => {
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(filesFormData([mdFile("nota.md", "Contenido suelto, sin cabecera.")]));

    expect(result).toEqual({ importadas: 1, fallidas: 0 });
    expect(captureMessage).toHaveBeenCalledWith("u1", "Contenido suelto, sin cabecera.", "ws1");
    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it("aplica etiquetas y fecha del frontmatter tras crear la nota, sin pasarlas por la IA", async () => {
    const contenido = "---\ntags: cocina, favoritos\ndate: 2024-03-15\n---\nDos huevos y harina.";
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(filesFormData([mdFile("receta.md", contenido)]));

    expect(result).toEqual({ importadas: 1, fallidas: 0 });
    expect(captureMessage).toHaveBeenCalledWith("u1", "Dos huevos y harina.", "ws1");
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { etiquetas: ["cocina", "favoritos"], fecha: new Date("2024-03-15") },
    });
  });

  it("varios ficheros se procesan en serie, uno detrás de otro, no en paralelo", async () => {
    const orden: number[] = [];
    captureMessage.mockImplementation(async () => {
      const id = ++nextId;
      orden.push(id);
      await new Promise((r) => setTimeout(r, 5));
      return { id: `m${id}` };
    });
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(
      filesFormData([mdFile("a.md", "Uno"), mdFile("b.md", "Dos"), mdFile("c.md", "Tres")]),
    );

    expect(result).toEqual({ importadas: 3, fallidas: 0 });
    expect(orden).toEqual([1, 2, 3]);
  });

  it("un fichero vacío cuenta como fallido, no interrumpe el resto de la tanda", async () => {
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(filesFormData([mdFile("vacio.md", "   "), mdFile("ok.md", "Contenido")]));

    expect(result).toEqual({ importadas: 1, fallidas: 1 });
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it("si captureMessage falla en un fichero, cuenta como fallido y sigue con el resto", async () => {
    captureMessage.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ id: "m2" });
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(filesFormData([mdFile("a.md", "Uno"), mdFile("b.md", "Dos")]));

    expect(result).toEqual({ importadas: 1, fallidas: 1 });
  });

  it("rechaza más de 12 ficheros de golpe, sin llamar a captureMessage", async () => {
    const files = Array.from({ length: 13 }, (_, i) => mdFile(`n${i}.md`, `Nota ${i}`));
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(filesFormData(files));

    expect(result.error).toMatch(/no se pueden importar más de 12/i);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("sin ficheros, da un error legible", async () => {
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(new FormData());
    expect(result.error).toMatch(/ningún fichero/);
  });

  it("demasiadas importaciones seguidas: no llama a captureMessage y avisa cuánto esperar", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(filesFormData([mdFile("a.md", "Uno")]));

    expect(result.error).toMatch(/2 min/);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("rechaza con rol VIEWER, sin llamar a captureMessage", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    const result = await importMarkdownFiles(filesFormData([mdFile("a.md", "Uno")]));

    expect(result.error).toMatch(/solo lectura/);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("revalida Notas y Pendientes solo si algo se importó de verdad", async () => {
    const { importMarkdownFiles } = await import("../src/app/(dashboard)/actions");
    await importMarkdownFiles(filesFormData([mdFile("vacio.md", "   ")]));
    expect(revalidatePath).not.toHaveBeenCalled();

    await importMarkdownFiles(filesFormData([mdFile("ok.md", "Contenido")]));
    expect(revalidatePath).toHaveBeenCalledWith("/notas");
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
  });
});
