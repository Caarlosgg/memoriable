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
  userId: "u1",
};

const captureMessage = vi.fn(async (_userId: string, _contenido: string) => fakeSaved);
vi.mock("../src/lib/pipeline", () => ({
  captureMessage: (userId: string, contenido: string) => captureMessage(userId, contenido),
}));

describe("createAssistantTools", () => {
  it("crearNota guarda el contenido con el mismo pipeline que la captura rápida, ligado al usuario de la sesión", async () => {
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.crearNota.execute!(
      { contenido: "Llamar al banco mañana" },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(captureMessage).toHaveBeenCalledWith("u1", "Llamar al banco mañana");
    expect(result).toMatchObject({
      id: "m1",
      categoria: "recordatorio",
      label: "Recordatorios",
      resumen: "Llamar al banco",
    });
  });
});
