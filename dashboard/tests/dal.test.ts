import { describe, expect, it, vi, beforeEach } from "vitest";

const readSessionCookie = vi.fn();
const verifySessionToken = vi.fn();
vi.mock("@/lib/session", () => ({
  readSessionCookie: (...args: unknown[]) => readSessionCookie(...args),
  verifySessionToken: (...args: unknown[]) => verifySessionToken(...args),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => userFindUnique(...args) } },
}));

beforeEach(() => {
  readSessionCookie.mockReset();
  readSessionCookie.mockResolvedValue("token-abc");
  verifySessionToken.mockReset();
  verifySessionToken.mockResolvedValue("u1");
  redirect.mockClear();
  userFindUnique.mockReset();
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
});
