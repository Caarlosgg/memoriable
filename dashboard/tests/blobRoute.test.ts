import { afterEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));

const verifySessionToken = vi.fn();
vi.mock("@/lib/session", () => ({
  SESSION_COOKIE_NAME: "session",
  verifySessionToken: (...args: unknown[]) => verifySessionToken(...args),
}));

const isSessionActive = vi.fn();
vi.mock("@/lib/sessionRevocation", () => ({ isSessionActive: (...args: unknown[]) => isSessionActive(...args) }));

const isActiveMember = vi.fn();
vi.mock("@/lib/workspace", () => ({ isActiveMember: (...args: unknown[]) => isActiveMember(...args) }));

const messageFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { message: { findFirst: (...args: unknown[]) => messageFindFirst(...args) } } }));

const blobGet = vi.fn();
vi.mock("@vercel/blob", () => ({ get: (...args: unknown[]) => blobGet(...args) }));

function req(pathParts: string[]) {
  return { request: new Request("https://memoriable.example/api/blob"), params: Promise.resolve({ path: pathParts }) };
}

describe("GET /api/blob/[...path]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión, 401 sin consultar el blob", async () => {
    cookieGet.mockReturnValue(undefined);
    verifySessionToken.mockResolvedValue(null);
    const { GET } = await import("../src/app/api/blob/[...path]/route");

    const { request, params } = req(["notas", "otro", "img.png"]);
    const res = await GET(request, { params });

    expect(res.status).toBe(401);
    expect(blobGet).not.toHaveBeenCalled();
  });

  it("quien subió la imagen puede verla aunque todavía no esté adjunta a ninguna nota (vista previa antes de guardar)", async () => {
    cookieGet.mockReturnValue({ value: "tok" });
    verifySessionToken.mockResolvedValue({ userId: "u1", issuedAt: new Date() });
    isSessionActive.mockResolvedValue(true);
    messageFindFirst.mockResolvedValue(null); // aún no guardada en ninguna nota
    blobGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/png" },
    });
    const { GET } = await import("../src/app/api/blob/[...path]/route");

    const { request, params } = req(["notas", "u1", "img.png"]);
    const res = await GET(request, { params });

    expect(res.status).toBe(200);
    // No hace falta ni consultar la nota: el prefijo ya basta.
    expect(messageFindFirst).not.toHaveBeenCalled();
  });

  it("un miembro del workspace puede ver una imagen que subió OTRO compañero, una vez adjunta a una nota", async () => {
    cookieGet.mockReturnValue({ value: "tok" });
    verifySessionToken.mockResolvedValue({ userId: "u2", issuedAt: new Date() });
    isSessionActive.mockResolvedValue(true);
    messageFindFirst.mockResolvedValue({ workspaceId: "ws1" });
    isActiveMember.mockResolvedValue(true);
    blobGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/png" },
    });
    const { GET } = await import("../src/app/api/blob/[...path]/route");

    // La subió u1, pero la pide u2 (compañero de equipo).
    const { request, params } = req(["notas", "u1", "img.png"]);
    const res = await GET(request, { params });

    expect(messageFindFirst).toHaveBeenCalledWith({
      where: { imagenes: { has: "/api/blob/notas/u1/img.png" } },
      select: { workspaceId: true },
    });
    expect(isActiveMember).toHaveBeenCalledWith("u2", "ws1");
    expect(res.status).toBe(200);
  });

  it("una cuenta ajena sin acceso al workspace no puede ver la imagen: 404, no 200", async () => {
    cookieGet.mockReturnValue({ value: "tok" });
    verifySessionToken.mockResolvedValue({ userId: "atacante", issuedAt: new Date() });
    isSessionActive.mockResolvedValue(true);
    messageFindFirst.mockResolvedValue({ workspaceId: "ws1" });
    isActiveMember.mockResolvedValue(false);
    const { GET } = await import("../src/app/api/blob/[...path]/route");

    const { request, params } = req(["notas", "u1", "img.png"]);
    const res = await GET(request, { params });

    expect(res.status).toBe(404);
    expect(blobGet).not.toHaveBeenCalled();
  });

  it("una imagen que no está adjunta a ninguna nota ajena tampoco se sirve (no basta con tener sesión)", async () => {
    cookieGet.mockReturnValue({ value: "tok" });
    verifySessionToken.mockResolvedValue({ userId: "atacante", issuedAt: new Date() });
    isSessionActive.mockResolvedValue(true);
    messageFindFirst.mockResolvedValue(null);
    const { GET } = await import("../src/app/api/blob/[...path]/route");

    const { request, params } = req(["notas", "u1", "img.png"]);
    const res = await GET(request, { params });

    expect(res.status).toBe(404);
    expect(blobGet).not.toHaveBeenCalled();
  });
});
