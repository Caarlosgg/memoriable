import { describe, expect, it } from "vitest";
import type { Message } from "@prisma/client";
import {
  buildContextBlock,
  buildSystemPrompt,
  buildWorkspaceContextLine,
  buildAmbientBlock,
  toAssistantSources,
} from "../src/lib/assistantContext";

function fakeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    tipo: "text",
    contenido: "Recuérdame pedir la matrícula del curso de IA",
    categoria: "recordatorio",
    resumen: "Pedir la matrícula del curso de IA",
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
    fecha: new Date("2026-07-28T21:24:00.000Z"),
    userId: "u1",
    ...overrides,
  };
}

describe("toAssistantSources", () => {
  it("mapea categoría a etiqueta y formatea la fecha", () => {
    const [source] = toAssistantSources([fakeMessage()]);

    expect(source).toMatchObject({
      id: "m1",
      categoria: "recordatorio",
      label: "Recordatorios",
      resumen: "Pedir la matrícula del curso de IA",
      contenido: "Recuérdame pedir la matrícula del curso de IA",
    });
    expect(source!.fecha).toContain("2026");
  });

  it("degrada a la presentación de 'otro' ante una categoría desconocida", () => {
    const [source] = toAssistantSources([fakeMessage({ categoria: "marciano" })]);
    expect(source!.label).toBe("Sin categorizar");
  });

  it("devuelve un array vacío si no hay mensajes", () => {
    expect(toAssistantSources([])).toEqual([]);
  });
});

describe("buildContextBlock", () => {
  it("dice honestamente que no hay nada cuando la lista está vacía (nunca inventa)", () => {
    const block = buildContextBlock([]);
    expect(block).toMatch(/no se ha encontrado/i);
  });

  it("incluye categoría, fecha, resumen y contenido de cada fuente, numeradas", () => {
    const sources = toAssistantSources([
      fakeMessage({ id: "a", resumen: "Resumen A" }),
      fakeMessage({ id: "b", resumen: "Resumen B", categoria: "idea" }),
    ]);

    const block = buildContextBlock(sources);

    expect(block).toContain("[1]");
    expect(block).toContain("[2]");
    expect(block).toContain("Resumen A");
    expect(block).toContain("Resumen B");
    expect(block).toContain("Recordatorios");
    expect(block).toContain("Ideas");
  });
});

describe("buildSystemPrompt", () => {
  it("incluye la regla de no inventar y el bloque de contexto recibido", () => {
    const prompt = buildSystemPrompt("CONTEXTO DE PRUEBA");

    expect(prompt).toContain("Nunca inventes");
    expect(prompt).toContain("CONTEXTO DE PRUEBA");
  });

  it("pide citar por categoría/fecha, no por id interno", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt.toLowerCase()).toContain("id interno");
  });

  it("pide redirigir con amabilidad las preguntas que no son sobre las notas del usuario", () => {
    // Normaliza espacios/saltos de línea: el prompt es un template literal
    // multilínea, así que una frase puede partirse en el código fuente.
    const prompt = buildSystemPrompt("x").toLowerCase().replace(/\s+/g, " ");
    expect(prompt).toContain("solo puedo ayudarte con memoriable y lo que has guardado");
    expect(prompt).toContain("redirige con amabilidad");
  });

  it("prohíbe explícitamente la fórmula mecánica 'Categoría (fecha): contenido'", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt).toContain("Categoría (fecha): contenido");
  });

  it("menciona la herramienta crearEvento para citas con fecha/hora concreta", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt).toContain("crearEvento");
  });

  it("menciona la herramienta completarTarea para marcar pendientes como hechas", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt).toContain("completarTarea");
  });

  it("menciona la herramienta registrarAhorro para ingresos/retiradas por voz", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt).toContain("registrarAhorro");
  });

  it("menciona las herramientas editarEvento y borrarEvento para gestionar citas existentes", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt).toContain("editarEvento");
    expect(prompt).toContain("borrarEvento");
  });

  it("menciona la herramienta consultarAhorros, de solo lectura", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt).toContain("consultarAhorros");
  });

  it("incluye la fecha/hora actual (pasada explícitamente), para poder calcular fechas relativas", () => {
    const now = new Date("2026-08-12T15:30:00.000Z");
    const prompt = buildSystemPrompt("x", now);
    expect(prompt).toContain("2026");
    expect(prompt.toLowerCase()).toContain("miércoles");
  });

  it("incluye el desfase de España respecto a UTC, en verano (+02:00, CEST)", () => {
    const prompt = buildSystemPrompt("x", new Date("2026-08-12T12:00:00.000Z"));
    expect(prompt).toContain("+02:00");
  });

  it("incluye el desfase de España respecto a UTC, en invierno (+01:00, CET)", () => {
    const prompt = buildSystemPrompt("x", new Date("2026-01-15T12:00:00.000Z"));
    expect(prompt).toContain("+01:00");
  });

  it("sin extra, no menciona ningún workspace de equipo ni estado ambiental", () => {
    const prompt = buildSystemPrompt("x");
    expect(prompt).not.toContain("espacio de equipo");
    expect(prompt).not.toContain("Estado actual");
  });

  it("con workspaceLine, la incluye en el prompt", () => {
    const prompt = buildSystemPrompt("x", new Date(), { workspaceLine: 'Trabajando en "Marketing".' });
    expect(prompt).toContain('Trabajando en "Marketing".');
  });

  it("con ambientBlock, la incluye bajo 'Estado actual'", () => {
    const prompt = buildSystemPrompt("x", new Date(), { ambientBlock: "Tiene 3 tareas pendientes." });
    expect(prompt).toContain("Estado actual");
    expect(prompt).toContain("Tiene 3 tareas pendientes.");
  });
});

describe("buildWorkspaceContextLine", () => {
  it("no dice nada si el espacio activo es el personal", () => {
    expect(buildWorkspaceContextLine({ isPersonal: true, nombre: "Personal", role: "OWNER" })).toBe("");
  });

  it("no dice nada si falta el nombre (defensivo, no debería pasar en producción)", () => {
    expect(buildWorkspaceContextLine({ isPersonal: false })).toBe("");
  });

  it("menciona el nombre del equipo y el rol del usuario", () => {
    const line = buildWorkspaceContextLine({ isPersonal: false, nombre: "Marketing", role: "ADMIN" });
    expect(line).toContain("Marketing");
    expect(line).toContain("administrador/a");
  });

  it("traduce cada rol a su etiqueta en español", () => {
    expect(buildWorkspaceContextLine({ isPersonal: false, nombre: "X", role: "OWNER" })).toContain("propietario/a");
    expect(buildWorkspaceContextLine({ isPersonal: false, nombre: "X", role: "MEMBER" })).toContain("miembro");
  });
});

describe("buildAmbientBlock", () => {
  it("dice honestamente que no hay nada pendiente ni próximo", () => {
    const block = buildAmbientBlock({ pendientesCount: 0, eventosProximos: [], eventosProximosCount: 0 });
    expect(block).toMatch(/no tiene tareas pendientes ni eventos/i);
  });

  it("cuenta las tareas pendientes en singular", () => {
    const block = buildAmbientBlock({ pendientesCount: 1, eventosProximos: [], eventosProximosCount: 0 });
    expect(block).toContain("1 tarea/recordatorio pendiente en el tablero");
  });

  it("cuenta las tareas pendientes en plural", () => {
    const block = buildAmbientBlock({ pendientesCount: 4, eventosProximos: [], eventosProximosCount: 0 });
    expect(block).toContain("4 tareas/recordatorios pendientes");
  });

  it("lista los eventos próximos con su fecha", () => {
    const block = buildAmbientBlock({
      pendientesCount: 0,
      eventosProximos: [{ titulo: "Reunión de equipo", fecha: "jue 13 ago, 10:00" }],
      eventosProximosCount: 1,
    });
    expect(block).toContain("Reunión de equipo (jue 13 ago, 10:00)");
    expect(block).toContain("1 evento en los próximos 7 días");
  });

  it("indica cuántos eventos más hay cuando exceden los listados", () => {
    const block = buildAmbientBlock({
      pendientesCount: 0,
      eventosProximos: [{ titulo: "A", fecha: "lun" }, { titulo: "B", fecha: "mar" }, { titulo: "C", fecha: "mié" }],
      eventosProximosCount: 5,
    });
    expect(block).toContain("5 eventos en los próximos 7 días");
    expect(block).toContain("y 2 más");
  });
});
