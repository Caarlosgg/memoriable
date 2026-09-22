import { describe, expect, it, vi, beforeEach } from "vitest";

// Sin test dedicado hasta ahora, pese a ser la captura rápida principal
// del dashboard — era además, junto a crearTareaEnColumna y
// /api/share-target, la única de las tres vías de captura autenticadas
// sin ningún límite de tasa.
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn();
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

const captureMessage = vi.fn();
vi.mock("@/lib/pipeline", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

function formDataConContenido(contenido: string): FormData {
  const fd = new FormData();
  fd.set("contenido", contenido);
  return fd;
}

describe("capture", () => {
  beforeEach(() => {
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
    captureMessage.mockReset();
    captureMessage.mockResolvedValue({ id: "m1", categoria: "nota" });
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    captureException.mockReset();
  });

  it("guarda el contenido recortado a través del pipeline", async () => {
    const { capture } = await import("../src/app/(dashboard)/actions");
    const result = await capture({}, formDataConContenido("  Comprar leche  "));

    expect(captureMessage).toHaveBeenCalledWith("u1", "Comprar leche", "ws1");
    expect(result.saved).toEqual({ id: "m1", categoria: "nota" });
  });

  it("rechaza contenido vacío sin llamar al pipeline", async () => {
    const { capture } = await import("../src/app/(dashboard)/actions");
    const result = await capture({}, formDataConContenido("   "));

    expect(result.error).toMatch(/escribe algo/i);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("rechaza con rol de solo lectura, sin tocar el pipeline ni el límite", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { capture } = await import("../src/app/(dashboard)/actions");
    const result = await capture({}, formDataConContenido("algo"));

    expect(result.error).toMatch(/solo lectura/);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("demasiadas capturas seguidas: no llama al pipeline y avisa cuánto esperar", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const { capture } = await import("../src/app/(dashboard)/actions");
    const result = await capture({}, formDataConContenido("algo"));

    expect(checkRateLimit).toHaveBeenCalledWith("capture:u1", 60, 60 * 60 * 1000);
    expect(result.error).toMatch(/42s/);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("un fallo del pipeline se reporta a Sentry y da un mensaje genérico, no la excepción cruda", async () => {
    captureMessage.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { capture } = await import("../src/app/(dashboard)/actions");
    const result = await capture({}, formDataConContenido("algo"));

    expect(captureException).toHaveBeenCalledOnce();
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/ECONNREFUSED|5432/);
  });
});
