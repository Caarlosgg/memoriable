import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const create = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();
const deleteMany = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiToken: {
      create: (...a: unknown[]) => create(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

beforeEach(() => {
  create.mockReset();
  create.mockImplementation(async ({ data }: { data: Record<string, string> }) => ({
    id: "t1",
    nombre: data.nombre,
    prefijo: data.prefijo,
  }));
  findUnique.mockReset();
  findMany.mockReset();
  deleteMany.mockReset();
  deleteMany.mockResolvedValue({ count: 1 });
  update.mockReset();
  update.mockResolvedValue({});
});

describe("createApiToken", () => {
  it("guarda el HASH, nunca el token: volcar la tabla no debe dar credenciales usables", async () => {
    const { createApiToken } = await import("@/lib/apiTokens");
    const { creado } = await createApiToken("u1", "Claude Desktop");

    const guardado = create.mock.calls[0]![0].data;
    expect(guardado.tokenHash).toBe(createHash("sha256").update(creado!.token).digest("hex"));
    expect(guardado).not.toHaveProperty("token");
    expect(JSON.stringify(guardado)).not.toContain(creado!.token);
  });

  it("el token lleva prefijo reconocible y suficiente entropía", async () => {
    const { createApiToken } = await import("@/lib/apiTokens");
    const { creado } = await createApiToken("u1", "Script");

    expect(creado!.token.startsWith("mia_")).toBe(true);
    // 32 bytes en base64url son 43 caracteres.
    expect(creado!.token.length).toBeGreaterThanOrEqual(45);
  });

  it("dos tokens seguidos no se parecen", async () => {
    const { createApiToken } = await import("@/lib/apiTokens");
    const a = await createApiToken("u1", "A");
    const b = await createApiToken("u1", "B");
    expect(a.creado!.token).not.toBe(b.creado!.token);
  });

  it("exige nombre: una lista de tokens sin nombre son fechas indistinguibles", async () => {
    const { createApiToken } = await import("@/lib/apiTokens");
    expect((await createApiToken("u1", "   ")).error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("autenticarPeticion", () => {
  function peticion(header?: string): Request {
    return new Request("https://x/api/v1/notas", {
      headers: header ? { authorization: header } : {},
    });
  }

  it("acepta un Bearer válido y devuelve el dueño", async () => {
    findUnique.mockResolvedValue({ id: "t1", userId: "u1", expiresAt: null });
    const { autenticarPeticion } = await import("@/lib/apiTokens");

    expect(await autenticarPeticion(peticion("Bearer mia_loquesea"))).toBe("u1");
  });

  it("rechaza sin cabecera", async () => {
    const { autenticarPeticion } = await import("@/lib/apiTokens");
    expect(await autenticarPeticion(peticion())).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rechaza un esquema que no sea Bearer", async () => {
    const { autenticarPeticion } = await import("@/lib/apiTokens");
    expect(await autenticarPeticion(peticion("Basic abc"))).toBeNull();
  });

  it("un token sin el prefijo ni llega a consultarse", async () => {
    const { autenticarPeticion } = await import("@/lib/apiTokens");
    expect(await autenticarPeticion(peticion("Bearer otracosa"))).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("un token que no existe no autentica", async () => {
    findUnique.mockResolvedValue(null);
    const { autenticarPeticion } = await import("@/lib/apiTokens");
    expect(await autenticarPeticion(peticion("Bearer mia_inventado"))).toBeNull();
  });

  it("un token caducado no vale, aunque exista la fila", async () => {
    findUnique.mockResolvedValue({ id: "t1", userId: "u1", expiresAt: new Date("2020-01-01") });
    const { autenticarPeticion } = await import("@/lib/apiTokens");
    expect(await autenticarPeticion(peticion("Bearer mia_viejo"))).toBeNull();
  });

  it("anota el último uso, para poder revocar con criterio los que ya no usa nadie", async () => {
    findUnique.mockResolvedValue({ id: "t1", userId: "u1", expiresAt: null });
    const { autenticarPeticion } = await import("@/lib/apiTokens");
    await autenticarPeticion(peticion("Bearer mia_ok"));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: { lastUsedAt: expect.any(Date) } }),
    );
  });
});

describe("revokeApiToken", () => {
  it("el userId va en el WHERE: un id ajeno no revoca nada", async () => {
    const { revokeApiToken } = await import("@/lib/apiTokens");
    await revokeApiToken("u1", "t1");

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "t1", userId: "u1" } });
  });

  it("devuelve false si no había nada que revocar", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    const { revokeApiToken } = await import("@/lib/apiTokens");
    expect(await revokeApiToken("u1", "inventado")).toBe(false);
  });
});
