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

import {
  toExportJson,
  toExportMarkdown,
  toExportCsv,
  buildObsidianVaultZip,
  isExportScope,
  buildExportData,
  type ExportPayload,
} from "../src/lib/exportData";
import JSZip from "jszip";

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
    imagenes: [],
    orden: 0,
    workspaceId: "ws1",
    assigneeId: null,
    camposExtra: {},
    checklist: [],
    fecha: new Date("2026-08-01T10:00:00.000Z"),
    fechaLimite: null,
    boardStatusId: null,
    enProgresoPorId: null,
    enProgresoDesde: null,
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
            workspaceId: "ws1",
            assigneeId: null,
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

describe("toExportCsv", () => {
  it("una fila por nota, con cabecera, sin importar el alcance de eventos/ahorros", () => {
    const payload = fakePayload({
      notas: [fakeMessage({ id: "m1", resumen: "Llamar al fontanero", categoria: "tarea", etiquetas: ["casa", "urgente"] })],
    });

    const csv = toExportCsv(payload);
    const [header, row] = csv.split("\n");

    expect(header).toBe("fecha,categoria,resumen,contenido,estado,prioridad,etiquetas");
    expect(row).toContain("tarea");
    expect(row).toContain("Llamar al fontanero");
    expect(row).toContain("casa; urgente");
  });

  it("escapa comas, comillas y saltos de línea dentro de una celda (RFC 4180)", () => {
    const payload = fakePayload({
      notas: [fakeMessage({ resumen: 'Con "comillas", coma y\nsalto' })],
    });

    const csv = toExportCsv(payload);

    // El campo entero queda entre comillas, y las internas se doblan — el
    // propio salto de línea de dentro del campo hace que un `split("\n")`
    // ingenuo lo trocee mal, así que se comprueba sobre el CSV completo.
    expect(csv).toContain('"Con ""comillas"", coma y\nsalto"');
  });

  it("sin notas, deja solo la cabecera", () => {
    const csv = toExportCsv(fakePayload({ notas: [] }));
    expect(csv).toBe("fecha,categoria,resumen,contenido,estado,prioridad,etiquetas");
  });
});

describe("buildObsidianVaultZip", () => {
  it("un archivo .md por nota, con front matter y el contenido como cuerpo", async () => {
    const payload = fakePayload({
      notas: [
        fakeMessage({
          id: "abc123def456",
          resumen: "Llamar al fontanero",
          contenido: "Llamar al fontanero para revisar la caldera",
          categoria: "tarea",
          estado: "POR_HACER",
          prioridad: "ALTA",
          etiquetas: ["casa"],
          fecha: new Date("2026-08-01T10:00:00.000Z"),
        }),
      ],
    });

    const buffer = await buildObsidianVaultZip(payload);
    const zip = await JSZip.loadAsync(buffer);
    const filenames = Object.keys(zip.files);

    // Nombre legible (fecha + resumen) Y el cuid al final — nunca colisiona
    // aunque dos notas tengan resúmenes parecidos.
    expect(filenames).toHaveLength(1);
    expect(filenames[0]).toMatch(/^2026-08-01-llamar-al-fontanero-.*def456\.md$/);

    const content = await zip.file(filenames[0]!)!.async("string");
    expect(content).toContain("---\n");
    expect(content).toContain("fecha: 2026-08-01T10:00:00.000Z");
    expect(content).toContain('prioridad: "ALTA"');
    expect(content).toContain("etiquetas: [\"casa\"]");
    expect(content).toContain("# Llamar al fontanero");
    expect(content).toContain("Llamar al fontanero para revisar la caldera");
  });

  it("una nota sin etiquetas deja el front matter con una lista vacía, no un campo roto", async () => {
    const payload = fakePayload({ notas: [fakeMessage({ etiquetas: [] })] });

    const buffer = await buildObsidianVaultZip(payload);
    const zip = await JSZip.loadAsync(buffer);
    const content = await zip.file(Object.keys(zip.files)[0]!)!.async("string");

    expect(content).toContain("etiquetas: []");
  });

  it("un vault vacío es un zip válido sin archivos", async () => {
    const buffer = await buildObsidianVaultZip(fakePayload({ notas: [] }));
    const zip = await JSZip.loadAsync(buffer);

    expect(Object.keys(zip.files)).toHaveLength(0);
  });
});
