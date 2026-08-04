import { describe, expect, it, vi, beforeEach } from "vitest";
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

// El tipo declara los dos parámetros (para que la llamada tipe bien y
// toHaveBeenCalledWith los verifique), pero la implementación no los usa —
// así no quedan parámetros sin usar que el linter marque.
const captureMessage = vi.fn<(userId: string, contenido: string) => Promise<StoredMessage>>(
  async () => fakeSaved,
);
vi.mock("../src/lib/pipeline", () => ({
  captureMessage: (userId: string, contenido: string) => captureMessage(userId, contenido),
}));

// `revalidatePath` exige contexto de petición de Next real (Route Handler en
// marcha) — fuera de eso, incluso en producción, lanza. En el test no hay
// petición real, así que se sustituye por un espía.
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

describe("createAssistantTools", () => {
  beforeEach(() => {
    captureMessage.mockReset();
    captureMessage.mockResolvedValue(fakeSaved);
    revalidatePath.mockReset();
  });

  it("crearNota guarda el contenido con el mismo pipeline que la captura rápida, ligado al usuario de la sesión, e invalida Tablero/Categorías", async () => {
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
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
    expect(revalidatePath).toHaveBeenCalledWith("/categorias");
  });

  it("ante un fallo al guardar, lanza un mensaje en español sin filtrar detalles internos", async () => {
    captureMessage.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.crearNota.execute!({ contenido: "algo" }, { toolCallId: "c", messages: [], context: undefined }),
    ).rejects.toThrow(/No se ha podido guardar la nota/);

    // El detalle interno (host/puerto de la BD) no debe salir en el mensaje.
    await expect(
      tools.crearNota.execute!({ contenido: "algo" }, { toolCallId: "c", messages: [], context: undefined }),
    ).rejects.not.toThrow(/ECONNREFUSED|supabase|5432/);
  });

  it("un fallo al invalidar la caché NO tumba un guardado correcto", async () => {
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.crearNota.execute!(
      { contenido: "Llamar al banco" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    // La nota se guardó: se devuelve la fuente igualmente.
    expect(result).toMatchObject({ id: "m1", label: "Recordatorios" });
  });
});
