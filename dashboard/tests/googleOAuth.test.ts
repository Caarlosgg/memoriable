import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const transaction = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    $transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
  },
}));

const createPersonalWorkspace = vi.fn();
vi.mock("../src/lib/workspace", () => ({
  createPersonalWorkspace: (...args: unknown[]) => createPersonalWorkspace(...args),
}));

describe("isGoogleOAuthConfigured", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("false si faltan las credenciales", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { isGoogleOAuthConfigured } = await import("../src/lib/googleOAuth");
    expect(isGoogleOAuthConfigured()).toBe(false);
  });

  it("true con ambas credenciales presentes", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    const { isGoogleOAuthConfigured } = await import("../src/lib/googleOAuth");
    expect(isGoogleOAuthConfigured()).toBe(true);
  });
});

describe("buildGoogleAuthorizeUrl", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("incluye client_id, redirect_uri, state y el scope openid email profile", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    const { buildGoogleAuthorizeUrl } = await import("../src/lib/googleOAuth");
    const url = new URL(buildGoogleAuthorizeUrl("state123", "https://memoriable.app/api/auth/google/callback"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://memoriable.app/api/auth/google/callback");
    expect(url.searchParams.get("state")).toBe("state123");
    // `profile` no es decorativo: es de donde sale el nombre de quien entra
    // por Google (nunca pasa por el formulario de registro).
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });
});

describe("findOrCreateGoogleUser", () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    userCreate.mockReset();
    userUpdate.mockReset();
    transaction.mockReset();
    transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb({ user: { create: userCreate } }));
    createPersonalWorkspace.mockReset();
    createPersonalWorkspace.mockResolvedValue("ws1");
  });

  it("crea una cuenta nueva sin contraseña, ya verificada, con su workspace personal", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "u-nuevo" });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    const userId = await findOrCreateGoogleUser("ana@example.com", "Ana Pérez");

    expect(userCreate).toHaveBeenCalledWith({
      data: { email: "ana@example.com", nombre: "Ana Pérez", passwordHash: null, emailVerified: true },
    });
    expect(createPersonalWorkspace).toHaveBeenCalledWith(expect.anything(), "u-nuevo");
    expect(userId).toBe("u-nuevo");
  });

  it("reutiliza una cuenta existente ya verificada sin tocarla", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: true, nombre: "Ana" });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    const userId = await findOrCreateGoogleUser("ana@example.com", "Ana");

    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(userId).toBe("u1");
  });

  it("marca verificada una cuenta existente por email/contraseña que aún no lo estaba", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: false, nombre: "Ana" });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    await findOrCreateGoogleUser("ana@example.com");

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { emailVerified: true } });
  });

  it("rellena el nombre de una cuenta que no lo tenía, sin pisar el que ya tiene", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: true, nombre: null });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    await findOrCreateGoogleUser("ana@example.com", "Ana Pérez");

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { nombre: "Ana Pérez" } });
  });

  it("no pisa un nombre que el usuario ya se había puesto en la app", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: true, nombre: "Anita" });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    await findOrCreateGoogleUser("ana@example.com", "Ana Pérez");

    expect(userUpdate).not.toHaveBeenCalled();
  });
});
