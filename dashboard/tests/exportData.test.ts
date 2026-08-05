import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
const eventoFindMany = vi.fn();
const cuentaFindMany = vi.fn();
const movimientoFindMany = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    evento: { findMany: (...args: unknown[]) => eventoFindMany(...args) },
    cuentaAhorro: { findMany: (...args: unknown[]) => cuentaFindMany(...args) },
    movimientoAhorro: { findMany: (...args: unknown[]) => movimientoFindMany(...args) },
  },
}));

import { toExportJson, toExportMarkdown, isExportScope, buildExportData, type ExportPayload } from "../src/lib/exportData";

function fakeMessage(overrides: Partial<ExportPayload["notas"][number]> = {}): ExportPayload["notas"][number] {
  return {
    id: "m1",
    tipo: "text",
    contenido: "Llamar al fontanero",
    categoria: "tarea",
    resumen: "Llamar al fontanero",
    hecho: false,
    estado: "POR_HACER",
    prioridad: "MEDIA",
    etiquetas: [],
    camposExtra: {},
    fecha: new Date("2026-08-01T10:00:00.000Z"),
    userId: "u1",
    ...overrides,
  };
}

function fakePayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    generatedAt: "2026-08-06T00:00:00.000Z",
    scope: { type: "todo" },
    notas: [],
    eventos: [],
    ahorros: [],
    ...overrides,
  };
}

describe("isExportScope", () => {
  it("acepta 'todo' y 'notas'", () => {
    expect(isExportScope({ type: "todo" })).toBe(true);
    expect(isExportScope({ type: "notas" })).toBe(true);
  });

  it("acepta 'categoria' con una categoría real", () => {
    expect(isExportScope({ type: "categoria", categoria: "tarea" })).toBe(true);
  });

  it("rechaza 'categoria' con un valor inventado", () => {
    expect(isExportScope({ type: "categoria", categoria: "marciano" })).toBe(false);
  });

  it("rechaza null, undefined, o formas sin 'type'", () => {
    expect(isExportScope(null)).toBe(false);
    expect(isExportScope(undefined)).toBe(false);
    expect(isExportScope({})).toBe(false);
    expect(isExportScope("todo")).toBe(false);
  });
});

describe("toExportJson", () => {
  it("serializa el payload completo, legible", () => {
    const json = toExportJson(fakePayload({ notas: [fakeMessage()] }));
    const parsed = JSON.parse(json);
    expect(parsed.notas).toHaveLength(1);
    expect(parsed.notas[0].resumen).toBe("Llamar al fontanero");
  });
});

describe("toExportMarkdown", () => {
  it("incluye cada nota con su categoría y contenido", () => {
    const md = toExportMarkdown(fakePayload({ notas: [fakeMessage({ resumen: "Resumen X", contenido: "Contenido X" })] }));
    expect(md).toContain("Resumen X");
    expect(md).toContain("Contenido X");
    expect(md).toContain("Tareas");
  });

  it("dice honestamente que no hay nada cuando la lista está vacía", () => {
    const md = toExportMarkdown(fakePayload());
    expect(md).toContain("Nada por aquí");
  });

  it("con alcance 'notas' o 'categoria' NO incluye las secciones de eventos/ahorros", () => {
    const md = toExportMarkdown(fakePayload({ scope: { type: "notas" }, notas: [fakeMessage()] }));
    expect(md).not.toContain("## Eventos");
    expect(md).not.toContain("## Ahorros");
  });

  it("con alcance 'todo' SÍ incluye eventos y ahorros, con el saldo calculado", () => {
    const md = toExportMarkdown(
      fakePayload({
        scope: { type: "todo" },
        eventos: [
          {
            id: "e1",
            titulo: "Cita médica",
            descripcion: null,
            fechaInicio: new Date("2026-08-12T10:00:00.000Z"),
            fechaFin: null,
            ubicacion: null,
            participantes: [],
            createdAt: new Date(),
            userId: "u1",
            messageId: null,
          },
        ],
        ahorros: [
          {
            cuenta: {
              id: "c1",
              nombre: "Fondo de emergencia",
              objetivoCentimos: null,
              createdAt: new Date(),
              userId: "u1",
            },
            movimientos: [
              { id: "mv1", centimos: 5000, concepto: null, fecha: new Date("2026-08-01T00:00:00.000Z"), cuentaId: "c1" },
              { id: "mv2", centimos: -1500, concepto: "coche", fecha: new Date("2026-08-02T00:00:00.000Z"), cuentaId: "c1" },
            ],
          },
        ],
      }),
    );
    expect(md).toContain("## Eventos");
    expect(md).toContain("Cita médica");
    expect(md).toContain("## Ahorros");
    expect(md).toContain("Fondo de emergencia");
    expect(md).toContain("35,00"); // saldo: 50 - 15 = 35 €
  });
});

describe("buildExportData", () => {
  beforeEach(() => {
    messageFindMany.mockReset();
    messageFindMany.mockResolvedValue([]);
    eventoFindMany.mockReset();
    eventoFindMany.mockResolvedValue([]);
    cuentaFindMany.mockReset();
    cuentaFindMany.mockResolvedValue([]);
    movimientoFindMany.mockReset();
    movimientoFindMany.mockResolvedValue([]);
  });

  it("con alcance 'todo' consulta notas, eventos y cuentas de ahorro, todo ligado al usuario", async () => {
    await buildExportData("u1", { type: "todo" });

    expect(messageFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(eventoFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(cuentaFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
  });

  it("con alcance 'notas' NO consulta eventos ni cuentas de ahorro", async () => {
    await buildExportData("u1", { type: "notas" });

    expect(messageFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(eventoFindMany).not.toHaveBeenCalled();
    expect(cuentaFindMany).not.toHaveBeenCalled();
  });

  it("con alcance 'categoria' filtra las notas por esa categoría exacta", async () => {
    await buildExportData("u1", { type: "categoria", categoria: "idea" });

    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", categoria: "idea" } }),
    );
    expect(eventoFindMany).not.toHaveBeenCalled();
  });

  it("trae los movimientos de cada cuenta de ahorro encontrada", async () => {
    cuentaFindMany.mockResolvedValue([
      { id: "c1", nombre: "Viaje", objetivoCentimos: null, createdAt: new Date(), userId: "u1" },
    ]);
    movimientoFindMany.mockResolvedValue([{ id: "mv1", centimos: 1000, concepto: null, fecha: new Date(), cuentaId: "c1" }]);

    const result = await buildExportData("u1", { type: "todo" });

    expect(movimientoFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cuentaId: "c1" } }));
    expect(result.ahorros).toEqual([
      {
        cuenta: { id: "c1", nombre: "Viaje", objetivoCentimos: null, createdAt: expect.any(Date), userId: "u1" },
        movimientos: [{ id: "mv1", centimos: 1000, concepto: null, fecha: expect.any(Date), cuentaId: "c1" }],
      },
    ]);
  });
});
