import { describe, expect, it, vi } from "vitest";
import type { StoredMessage } from "../src/lib/botPipeline/repository";

const fakeSaved: StoredMessage = {
  id: "m1",
  tipo: "text",
  contenido: "Llamar al banco mañana",
  categoria: "recordatorio",
  resumen: "Llamar al banco",
  hecho: false,
  fecha: new Date("2026-08-04T10:00:00.000Z"),
};

const captureMessage = vi.fn(async () => fakeSaved);
vi.mock("../src/lib/pipeline", () => ({ captureMessage: (contenido: string) => captureMessage(contenido) }));

describe("assistantTools.crearNota", () => {
  it("guarda el contenido con el mismo pipeline que la captura rápida y devuelve una fuente presentable", async () => {
    const { assistantTools } = await import("../src/lib/assistantTools");

    const result = await assistantTools.crearNota.execute!(
      { contenido: "Llamar al banco mañana" },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(captureMessage).toHaveBeenCalledWith("Llamar al banco mañana");
    expect(result).toMatchObject({
      id: "m1",
      categoria: "recordatorio",
      label: "Recordatorios",
      resumen: "Llamar al banco",
    });
  });
});
