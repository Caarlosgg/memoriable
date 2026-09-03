import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifySessionToken = vi.fn();
vi.mock("@/lib/session", () => ({
  SESSION_COOKIE_NAME: "memoria_ia_session",
  verifySessionToken: (...args: unknown[]) => verifySessionToken(...args),
}));

function requestTo(path: string, { authenticated = false }: { authenticated?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = authenticated ? { cookie: "memoria_ia_session=fake-token" } : {};
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

describe("proxy", () => {
  beforeEach(() => {
    verifySessionToken.mockReset();
  });

  it("deja pasar /verificar-email sin sesión (quien confirma el correo nunca está logueado)", async () => {
    verifySessionToken.mockResolvedValue(null);
    const { proxy } = await import("../src/proxy");
    const res = await proxy(requestTo("/verificar-email?token=abc"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("deja pasar /verificar-email también con sesión (no lo redirige como a /login o /registro)", async () => {
    verifySessionToken.mockResolvedValue("u1");
    const { proxy } = await import("../src/proxy");
    const res = await proxy(requestTo("/verificar-email?token=abc", { authenticated: true }));
    expect(res.headers.get("location")).toBeNull();
  });

  it.each(["/terminos", "/privacidad"])(
    "deja pasar %s sin sesión (se enlazan desde el registro, cuando aún no hay cuenta)",
    async (ruta) => {
      verifySessionToken.mockResolvedValue(null);
      const { proxy } = await import("../src/proxy");
      const res = await proxy(requestTo(ruta));
      expect(res.headers.get("location")).toBeNull();
    },
  );

  it("manda a /login una ruta protegida sin sesión", async () => {
    verifySessionToken.mockResolvedValue(null);
    const { proxy } = await import("../src/proxy");
    const res = await proxy(requestTo("/pendientes"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("deja pasar una ruta protegida con sesión válida", async () => {
    verifySessionToken.mockResolvedValue("u1");
    const { proxy } = await import("../src/proxy");
    const res = await proxy(requestTo("/pendientes", { authenticated: true }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("manda a / si ya hay sesión y visita /login", async () => {
    verifySessionToken.mockResolvedValue("u1");
    const { proxy } = await import("../src/proxy");
    const res = await proxy(requestTo("/login", { authenticated: true }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("deja pasar /login sin sesión", async () => {
    verifySessionToken.mockResolvedValue(null);
    const { proxy } = await import("../src/proxy");
    const res = await proxy(requestTo("/login"));
    expect(res.headers.get("location")).toBeNull();
  });
});
