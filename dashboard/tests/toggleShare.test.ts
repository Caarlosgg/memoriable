import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
const getActiveWorkspace = vi.fn(async () => ({ workspaceId: "ws1", isPersonal: true, role: "OWNER" }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: () => getActiveWorkspace(),
  canWrite: (role: string) => role !== "VIEWER",
  READONLY_ROLE_MESSAGE: "Tu rol en este equipo es de solo lectura — no puedes hacer cambios.",
}));

const messageFindFirst = vi.fn();
const messageUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
      update: (...args: unknown[]) => messageUpdate(...args),
    },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const HEX64 = /^[0-9a-f]{64}$/;

describe("toggleShare", () => {
  beforeEach(() => {
    messageFindFirst.mockReset();
    messageUpdate.mockReset();
    revalidatePath.mockReset();
    getActiveWorkspace.mockReset();
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: true, role: "OWNER" });
  });

  it("nota sin compartir: genera un token nuevo, largo y aleatorio", async () => {
    messageFindFirst.mockResolvedValue({ shareToken: null });
    const { toggleShare } = await import("../src/app/(dashboard)/actions");

    const result = await toggleShare("m1");

    expect(result.shareToken).toMatch(HEX64);
    expect(messageUpdate).toHaveBeenCalledWith({ where: { id: "m1" }, data: { shareToken: result.shareToken } });
    expect(revalidatePath).toHaveBeenCalledWith("/notas");
  });

  it("nota ya compartida: revoca (vuelve a null), no reutiliza el token viejo", async () => {
    messageFindFirst.mockResolvedValue({ shareToken: "elviejo".repeat(9) });
    const { toggleShare } = await import("../src/app/(dashboard)/actions");

    const result = await toggleShare("m1");

    expect(result.shareToken).toBeNull();
    expect(messageUpdate).toHaveBeenCalledWith({ where: { id: "m1" }, data: { shareToken: null } });
  });

  it("compartir y volver a compartir da un token DISTINTO cada vez", async () => {
    messageFindFirst.mockResolvedValueOnce({ shareToken: null });
    const { toggleShare } = await import("../src/app/(dashboard)/actions");
    const primero = await toggleShare("m1");

    messageFindFirst.mockResolvedValueOnce({ shareToken: null });
    const segundo = await toggleShare("m1");

    expect(primero.shareToken).not.toBe(segundo.shareToken);
  });

  it("busca dentro del workspace activo — un id ajeno no comparte nada", async () => {
    messageFindFirst.mockResolvedValue(null);
    const { toggleShare } = await import("../src/app/(dashboard)/actions");

    const result = await toggleShare("ajena");

    expect(messageFindFirst).toHaveBeenCalledWith({
      where: { id: "ajena", workspaceId: "ws1" },
      select: { shareToken: true },
    });
    expect(result.error).toMatch(/no se ha encontrado/i);
    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it("rechaza con rol VIEWER, sin tocar la base de datos", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "ws1", isPersonal: false, role: "VIEWER" });
    const { toggleShare } = await import("../src/app/(dashboard)/actions");

    const result = await toggleShare("m1");

    expect(result.error).toMatch(/solo lectura/);
    expect(messageFindFirst).not.toHaveBeenCalled();
  });

  it("un fallo se traduce a un mensaje genérico en español", async () => {
    messageFindFirst.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { toggleShare } = await import("../src/app/(dashboard)/actions");

    const result = await toggleShare("m1");
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/ECONNREFUSED|5432/);
  });
});
