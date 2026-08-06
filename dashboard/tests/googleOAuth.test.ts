import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
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

  it("incluye client_id, redirect_uri, state y el scope openid email", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    const { buildGoogleAuthorizeUrl } = await import("../src/lib/googleOAuth");
    const url = new URL(buildGoogleAuthorizeUrl("state123", "https://memoriable.app/api/auth/google/callback"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://memoriable.app/api/auth/google/callback");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("scope")).toBe("openid email");
  });
});

describe("findOrCreateGoogleUser", () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    userCreate.mockReset();
    userUpdate.mockReset();
  });

  it("crea una cuenta nueva sin contraseña, ya verificada", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "u-nuevo" });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    const userId = await findOrCreateGoogleUser("ana@example.com");

    expect(userCreate).toHaveBeenCalledWith({
      data: { email: "ana@example.com", passwordHash: null, emailVerified: true },
    });
    expect(userId).toBe("u-nuevo");
  });

  it("reutiliza una cuenta existente ya verificada sin tocarla", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: true });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    const userId = await findOrCreateGoogleUser("ana@example.com");

    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(userId).toBe("u1");
  });

  it("marca verificada una cuenta existente por email/contraseña que aún no lo estaba", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", emailVerified: false });
    const { findOrCreateGoogleUser } = await import("../src/lib/googleOAuth");

    await findOrCreateGoogleUser("ana@example.com");

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { emailVerified: true } });
  });
});
