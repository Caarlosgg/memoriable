import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyBotSecret } from "../src/lib/botAuth";

function reqCon(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("https://dashboard.example.com/api/bot/set-email", { headers });
}

describe("verifyBotSecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("acepta el secreto correcto en 'Bearer <secreto>'", () => {
    vi.stubEnv("BOT_API_SECRET", "el-secreto");
    expect(verifyBotSecret(reqCon("Bearer el-secreto"))).toBe(true);
  });

  it("rechaza un secreto incorrecto", () => {
    vi.stubEnv("BOT_API_SECRET", "el-secreto");
    expect(verifyBotSecret(reqCon("Bearer otro-cualquiera"))).toBe(false);
  });

  it("rechaza sin cabecera Authorization", () => {
    vi.stubEnv("BOT_API_SECRET", "el-secreto");
    expect(verifyBotSecret(reqCon(null))).toBe(false);
  });

  it("rechaza sin el prefijo 'Bearer '", () => {
    vi.stubEnv("BOT_API_SECRET", "el-secreto");
    expect(verifyBotSecret(reqCon("el-secreto"))).toBe(false);
  });

  it("sin BOT_API_SECRET configurado en el servidor, la ruta queda cerrada (nunca abierta)", () => {
    vi.stubEnv("BOT_API_SECRET", "");
    expect(verifyBotSecret(reqCon("Bearer cualquier-cosa"))).toBe(false);
  });
});
