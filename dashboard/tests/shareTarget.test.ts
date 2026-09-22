import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const verifySession = vi.fn(async () => "u1");
vi.mock("@/lib/dal", () => ({ verifySession: () => verifySession() }));

const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
}));

const captureMessage = vi.fn();
vi.mock("@/lib/pipeline", () => ({ captureMessage: (...args: unknown[]) => captureMessage(...args) }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args) }));

function shareRequest(fields: Record<string, string>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("https://memoriable.example/api/share-target", { method: "POST", body: fd });
}

describe("POST /api/share-target", () => {
  beforeEach(() => {
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    verifySession.mockClear();
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
    captureMessage.mockReset();
    checkRateLimit.mockReset();
  });

  it("guarda el texto compartido y redirige a la nota creada", async () => {
    captureMessage.mockResolvedValue({ id: "m1" });
    const { POST } = await import("../src/app/api/share-target/route");

    const res = await POST(shareRequest({ title: "Receta", text: "2 huevos, harina", url: "" }));

    expect(captureMessage).toHaveBeenCalledWith("u1", "Receta\n\n2 huevos, harina", "ws1");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://memoriable.example/notas?mensaje=m1");
  });

  it("no duplica cuando la misma URL viene en `text` y en `url`", async () => {
    captureMessage.mockResolvedValue({ id: "m1" });
    const { POST } = await import("../src/app/api/share-target/route");

    await POST(shareRequest({ title: "", text: "https://ejemplo.com", url: "https://ejemplo.com" }));

    expect(captureMessage).toHaveBeenCalledWith("u1", "https://ejemplo.com", "ws1");
  });

  it("sin nada que guardar (todo vacío), redirige a Notas sin llamar a captureMessage", async () => {
    const { POST } = await import("../src/app/api/share-target/route");

    const res = await POST(shareRequest({ title: "", text: "", url: "" }));

    expect(captureMessage).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://memoriable.example/notas");
  });

  it("rol VIEWER: no guarda nada, redirige a Notas en silencio", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { POST } = await import("../src/app/api/share-target/route");

    const res = await POST(shareRequest({ title: "", text: "algo", url: "" }));

    expect(captureMessage).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://memoriable.example/notas");
  });

  it("si captureMessage falla, no lanza — redirige a Notas igualmente", async () => {
    captureMessage.mockRejectedValue(new Error("boom"));
    const { POST } = await import("../src/app/api/share-target/route");

    const res = await POST(shareRequest({ title: "", text: "algo", url: "" }));

    expect(res.headers.get("location")).toBe("https://memoriable.example/notas");
  });

  it("demasiadas capturas seguidas: no llama a captureMessage, redirige a Notas en silencio", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const { POST } = await import("../src/app/api/share-target/route");

    const res = await POST(shareRequest({ title: "", text: "algo", url: "" }));

    expect(checkRateLimit).toHaveBeenCalledWith("capture:u1", 60, 60 * 60 * 1000);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://memoriable.example/notas");
  });
});
