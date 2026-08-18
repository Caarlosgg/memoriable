import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const getActiveWorkspace = vi.fn();
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  isActiveMember: vi.fn(async () => true),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

const captureMessage = vi.fn();
vi.mock("@/lib/pipeline", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/activityLog", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/blobUpload", () => ({ uploadImageToBlob: vi.fn() }));

const boardStatusFindMany = vi.fn();
const messageUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    boardStatus: { findMany: (...a: unknown[]) => boardStatusFindMany(...a) },
    message: { update: (...a: unknown[]) => messageUpdate(...a) },
  },
}));

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "MEMBER" });
  captureMessage.mockReset();
  captureMessage.mockResolvedValue({ id: "m1", categoria: "tarea" });
  boardStatusFindMany.mockReset();
  boardStatusFindMany.mockResolvedValue([]);
  messageUpdate.mockReset();
  messageUpdate.mockResolvedValue({ id: "m1", categoria: "tarea", estado: "POR_HACER" });
});

describe("crearTareaEnColumna", () => {
  it("rechaza con rol de solo lectura, sin llegar a guardar nada", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    const result = await crearTareaEnColumna("Llamar al proveedor", "POR_HACER");

    expect(result.error).toMatch(/solo lectura/);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("rechaza texto vacío sin llamar al pipeline (que cuesta una llamada a la IA)", async () => {
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    const result = await crearTareaEnColumna("   ", "POR_HACER");

    expect(result.error).toMatch(/escribe algo/i);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("pasa por el MISMO pipeline que la captura rápida — no crea notas de segunda", async () => {
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    await crearTareaEnColumna("  Llamar al proveedor  ", "POR_HACER");

    // Recortado, y con el workspace resuelto en el servidor (no del cliente).
    expect(captureMessage).toHaveBeenCalledWith("u1", "Llamar al proveedor", "ws1");
  });

  it("en una columna por defecto deja boardStatusId a null, como toda la vida", async () => {
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    await crearTareaEnColumna("X", "EN_PROGRESO");

    const { data } = messageUpdate.mock.calls[0]![0];
    expect(data.estado).toBe("EN_PROGRESO");
    expect(data.boardStatusId).toBeNull();
    expect(data.hecho).toBe(false);
  });

  it("en una columna propia guarda su id y la FASE que esa columna declara", async () => {
    boardStatusFindMany.mockResolvedValue([
      { id: "c1", nombre: "Por hacer", orden: 0, fase: "POR_HACER" },
      { id: "c2", nombre: "En revisión", orden: 1, fase: "EN_PROGRESO" },
    ]);
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    await crearTareaEnColumna("X", "c2");

    const { data } = messageUpdate.mock.calls[0]![0];
    // La fase NO viene del cliente: se deduce de la columna en el servidor.
    expect(data.estado).toBe("EN_PROGRESO");
    expect(data.boardStatusId).toBe("c2");
  });

  it("crear en una columna de fase HECHO deja `hecho` sincronizado (lo lee el bot y el resumen diario)", async () => {
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    await crearTareaEnColumna("Ya está", "HECHO");

    expect(messageUpdate.mock.calls[0]![0].data.hecho).toBe(true);
  });

  it("con un id de columna inventado no coloca la tarjeta en ningún sitio raro", async () => {
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    const result = await crearTareaEnColumna("X", "inventada");

    expect(result.error).toMatch(/no existe/i);
    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it("si el pipeline la categoriza como algo que NO sale en el tablero, lo avisa pero la guarda igual", async () => {
    captureMessage.mockResolvedValue({ id: "m1", categoria: "idea" });
    messageUpdate.mockResolvedValue({ id: "m1", categoria: "idea", estado: "POR_HACER" });
    const { crearTareaEnColumna } = await import("../src/app/(dashboard)/actions");
    const result = await crearTareaEnColumna("Y si montamos una web", "POR_HACER");

    // Las dos cosas a la vez: guardada de verdad, pero avisando de que no
    // aparecerá donde el usuario está mirando.
    expect(result.message).toBeDefined();
    expect(result.error).toMatch(/no aparece en el tablero/i);
  });
});
