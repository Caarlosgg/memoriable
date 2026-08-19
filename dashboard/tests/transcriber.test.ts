import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const create = vi.fn();
vi.mock("groq-sdk", () => ({
  default: class {
    audio = { transcriptions: { create: (...args: unknown[]) => create(...args) } };
  },
}));

const ORIGINAL_KEY = process.env.GROQ_API_KEY;

beforeEach(() => {
  create.mockReset();
});

afterEach(() => {
  process.env.GROQ_API_KEY = ORIGINAL_KEY;
});

describe("isVoiceConfigured", () => {
  it("depende solo de que exista GROQ_API_KEY — mismo criterio que el resto de integraciones perezosas", async () => {
    process.env.GROQ_API_KEY = "";
    vi.resetModules();
    const { isVoiceConfigured } = await import("../src/lib/transcriber");
    expect(isVoiceConfigured()).toBe(false);

    process.env.GROQ_API_KEY = "gsk_test";
    vi.resetModules();
    const { isVoiceConfigured: withKey } = await import("../src/lib/transcriber");
    expect(withKey()).toBe(true);
  });
});

describe("transcribeAudio", () => {
  it("sin GROQ_API_KEY devuelve null sin llamar a Groq", async () => {
    process.env.GROQ_API_KEY = "";
    vi.resetModules();
    const { transcribeAudio } = await import("../src/lib/transcriber");
    const result = await transcribeAudio(new File(["x"], "a.webm", { type: "audio/webm" }));
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("recorta el texto y devuelve null si sale vacío — nunca inventa una transcripción", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    vi.resetModules();
    create.mockResolvedValue({ text: "   " });
    const { transcribeAudio } = await import("../src/lib/transcriber");
    const result = await transcribeAudio(new File(["x"], "a.webm", { type: "audio/webm" }));
    expect(result).toBeNull();
  });

  it("devuelve el texto transcrito, pasando el fichero tal cual (sin URL, ver el comentario del módulo)", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    vi.resetModules();
    create.mockResolvedValue({ text: "Llamar al fontanero mañana" });
    const { transcribeAudio } = await import("../src/lib/transcriber");
    const file = new File(["x"], "a.webm", { type: "audio/webm" });
    const result = await transcribeAudio(file);

    expect(result).toBe("Llamar al fontanero mañana");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ file, language: "es" }));
    expect(create.mock.calls[0]![0]).not.toHaveProperty("url");
  });

  it("nunca lanza: un fallo de Groq se convierte en null", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    vi.resetModules();
    create.mockRejectedValue(new Error("503"));
    const { transcribeAudio } = await import("../src/lib/transcriber");
    await expect(transcribeAudio(new File(["x"], "a.webm", { type: "audio/webm" }))).resolves.toBeNull();
  });
});
