import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
// No se llama a ninguna función que use prisma directamente en este archivo
// (generateTelegramLinkCode no se testea aquí), pero el módulo de acciones
// importa `@/lib/prisma` a nivel de módulo — se mockea igual, regla 3 de
// CLAUDE.md: nada de dependencias de servicios reales en los tests.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const buildExportData = vi.fn();
vi.mock("@/lib/exportData", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/exportData")>("../src/lib/exportData");
  return { ...actual, buildExportData: (...args: unknown[]) => buildExportData(...args) };
});

describe("exportData (server action)", () => {
  beforeEach(() => {
    buildExportData.mockReset();
    buildExportData.mockResolvedValue({
      generatedAt: "2026-08-06T00:00:00.000Z",
      scope: { type: "todo" },
      notas: [],
      eventos: [],
      ahorros: [],
    });
  });

  it("rechaza un alcance con forma inválida sin tocar la base de datos", async () => {
    const { exportData } = await import("../src/app/(dashboard)/cuenta/actions");
    // @ts-expect-error - forma inválida a propósito, para probar la validación en runtime
    const result = await exportData({ type: "otra-cosa" }, "markdown");

    expect(result.error).toBeDefined();
    expect(buildExportData).not.toHaveBeenCalled();
  });

  it("genera Markdown ligado al usuario de la sesión, con un nombre de fichero legible", async () => {
    const { exportData } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await exportData({ type: "todo" }, "markdown");

    expect(buildExportData).toHaveBeenCalledWith("u1", { type: "todo" });
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("# Exportación de MemorIAble");
    expect(result.filename).toMatch(/^memoriable-todo-2026-08-06\.md$/);
  });

  it("genera JSON válido cuando se pide ese formato", async () => {
    const { exportData } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await exportData({ type: "categoria", categoria: "idea" }, "json");

    expect(result.filename).toMatch(/^memoriable-idea-2026-08-06\.json$/);
    expect(() => JSON.parse(result.content ?? "")).not.toThrow();
  });

  it("un fallo al leer los datos se traduce a un mensaje genérico en español", async () => {
    buildExportData.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { exportData } = await import("../src/app/(dashboard)/cuenta/actions");

    const result = await exportData({ type: "todo" }, "markdown");
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/ECONNREFUSED|5432/);
  });

  it("genera CSV cuando se pide ese formato", async () => {
    buildExportData.mockResolvedValue({
      generatedAt: "2026-08-06T00:00:00.000Z",
      scope: { type: "notas" },
      notas: [],
      eventos: [],
      ahorros: [],
    });
    const { exportData } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await exportData({ type: "notas" }, "csv");

    expect(result.filename).toMatch(/^memoriable-notas-2026-08-06\.csv$/);
    expect(result.content).toMatch(/^fecha,categoria,resumen,contenido,estado,prioridad,etiquetas/);
    expect(result.binary).toBeUndefined();
  });

  it("genera el vault de Obsidian como .zip en base64, marcado como binario", async () => {
    const { exportData } = await import("../src/app/(dashboard)/cuenta/actions");
    const result = await exportData({ type: "todo" }, "obsidian");

    expect(result.filename).toMatch(/^memoriable-obsidian-todo-2026-08-06\.zip$/);
    expect(result.binary).toBe(true);
    // Un .zip real empieza por la firma "PK" — confirma que de verdad es
    // binario codificado en base64, no texto plano disfrazado.
    expect(Buffer.from(result.content ?? "", "base64").subarray(0, 2).toString()).toBe("PK");
  });
});
