import { describe, expect, it, vi, beforeEach } from "vitest";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

// `cache()` de React memoiza por petición; en un test no hay petición, y sin
// esto dos llamadas con los mismos argumentos compartirían resultado entre
// casos. Se sustituye por la identidad: cada llamada ejecuta la función.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const REVOCADA_A_LAS_12 = new Date("2026-08-17T12:00:00.000Z");

beforeEach(() => {
  userFindUnique.mockReset();
  userUpdate.mockReset();
  userUpdate.mockResolvedValue({});
});

describe("isSessionActive", () => {
  it("acepta cualquier sesión si el usuario nunca ha revocado nada", async () => {
    userFindUnique.mockResolvedValue({ sessionsValidFrom: null });
    const { isSessionActive } = await import("../src/lib/sessionRevocation");
    await expect(isSessionActive("u1", new Date("2020-01-01T00:00:00.000Z"))).resolves.toBe(true);
  });

  it("rechaza un token emitido ANTES de la revocación", async () => {
    userFindUnique.mockResolvedValue({ sessionsValidFrom: REVOCADA_A_LAS_12 });
    const { isSessionActive } = await import("../src/lib/sessionRevocation");
    await expect(isSessionActive("u1", new Date("2026-08-17T11:59:00.000Z"))).resolves.toBe(false);
  });

  it("acepta un token emitido DESPUÉS de la revocación (la sesión nueva del propio dispositivo)", async () => {
    userFindUnique.mockResolvedValue({ sessionsValidFrom: REVOCADA_A_LAS_12 });
    const { isSessionActive } = await import("../src/lib/sessionRevocation");
    await expect(isSessionActive("u1", new Date("2026-08-17T12:00:30.000Z"))).resolves.toBe(true);
  });

  it("tolera el redondeo a segundos de `iat`: un token del mismo segundo sigue valiendo", async () => {
    // `iat` solo tiene resolución de segundos, así que la sesión que se crea
    // justo después de revocar puede quedar unos milisegundos "antes" — sin
    // el margen, cambiar la contraseña te echaba a ti mismo.
    userFindUnique.mockResolvedValue({ sessionsValidFrom: new Date("2026-08-17T12:00:00.800Z") });
    const { isSessionActive } = await import("../src/lib/sessionRevocation");
    await expect(isSessionActive("u1", new Date("2026-08-17T12:00:00.000Z"))).resolves.toBe(true);
  });

  it("rechaza si el usuario ya no existe (cuenta borrada con la sesión aún viva)", async () => {
    userFindUnique.mockResolvedValue(null);
    const { isSessionActive } = await import("../src/lib/sessionRevocation");
    await expect(isSessionActive("u1", new Date())).resolves.toBe(false);
  });

  it("fail-open: si la consulta falla, deja pasar (un fallo de BD no debe echar a todo el mundo)", async () => {
    userFindUnique.mockRejectedValue(new Error("ECONNREFUSED"));
    const { isSessionActive } = await import("../src/lib/sessionRevocation");
    await expect(isSessionActive("u1", new Date())).resolves.toBe(true);
  });
});

describe("revokeAllSessions", () => {
  it("mueve la marca a ahora para el usuario dado", async () => {
    const { revokeAllSessions } = await import("../src/lib/sessionRevocation");
    await revokeAllSessions("u1");

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionsValidFrom: expect.any(Date) },
    });
  });
});
