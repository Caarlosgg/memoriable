import { describe, expect, it, vi, beforeEach } from "vitest";

const readSessionCookie = vi.fn();
const verifySessionToken = vi.fn();
vi.mock("@/lib/session", () => ({
  readSessionCookie: (...args: unknown[]) => readSessionCookie(...args),
  verifySessionToken: (...args: unknown[]) => verifySessionToken(...args),
}));

// Se mockea el módulo entero (en vez de dejar que consulte por `prisma`):
// `isSessionActive` va envuelto en `cache()` de React, y aquí solo interesa
// CÓMO reacciona `dal` a su respuesta, no su implementación (que tiene sus
// propias pruebas de comportamiento en sessionRevocation.test.ts).
const isSessionActive = vi.fn();
vi.mock("@/lib/sessionRevocation", () => ({
  isSessionActive: (...args: unknown[]) => isSessionActive(...args),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => userFindUnique(...args) } },
}));

const SESSION = { userId: "u1", issuedAt: new Date("2026-08-17T10:00:00.000Z") };

beforeEach(() => {
  readSessionCookie.mockReset();
  readSessionCookie.mockResolvedValue("token-abc");
  verifySessionToken.mockReset();
  verifySessionToken.mockResolvedValue(SESSION);
  isSessionActive.mockReset();
  isSessionActive.mockResolvedValue(true);
  redirect.mockClear();
  userFindUnique.mockReset();
});

describe("verifySession", () => {
  it("devuelve el userId cuando el token es válido y la sesión no está revocada", async () => {
    const { verifySession } = await import("../src/lib/dal");
    await expect(verifySession()).resolves.toBe("u1");
    expect(isSessionActive).toHaveBeenCalledWith("u1", SESSION.issuedAt);
  });

  it("redirige a /login si la sesión fue revocada, aunque la firma del token siga siendo válida", async () => {
    // Es el caso que motiva toda la revocación: cambiar la contraseña (o
    // cerrar las demás sesiones) tiene que echar a un token todavía no
    // caducado — antes de esto seguía valiendo 30 días pasara lo que pasara.
    isSessionActive.mockResolvedValue(false);
    const { verifySession } = await import("../src/lib/dal");
    await expect(verifySession()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirige a /login sin llegar a comprobar la revocación si no hay token válido", async () => {
    verifySessionToken.mockResolvedValue(null);
    const { verifySession } = await import("../src/lib/dal");
    await expect(verifySession()).rejects.toThrow("REDIRECT:/login");
    expect(isSessionActive).not.toHaveBeenCalled();
  });
});

describe("requireSuperAdmin", () => {
  it("devuelve el userId si es superadmin", async () => {
    userFindUnique.mockResolvedValue({ isSuperAdmin: true });
    const { requireSuperAdmin } = await import("../src/lib/dal");
    await expect(requireSuperAdmin()).resolves.toBe("u1");
  });

  it("redirige a /asistente si está autenticado pero no es superadmin", async () => {
    userFindUnique.mockResolvedValue({ isSuperAdmin: false });
    const { requireSuperAdmin } = await import("../src/lib/dal");
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/asistente");
  });

  it("redirige a /asistente si el usuario ya no existe", async () => {
    userFindUnique.mockResolvedValue(null);
    const { requireSuperAdmin } = await import("../src/lib/dal");
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/asistente");
  });

  it("redirige a /login si no hay sesión válida (nunca llega a comprobar isSuperAdmin)", async () => {
    verifySessionToken.mockResolvedValue(null);
    const { requireSuperAdmin } = await import("../src/lib/dal");
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/login");
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("redirige a /login si la sesión fue revocada (tampoco llega a comprobar isSuperAdmin)", async () => {
    isSessionActive.mockResolvedValue(false);
    const { requireSuperAdmin } = await import("../src/lib/dal");
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/login");
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});
