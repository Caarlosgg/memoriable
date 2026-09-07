import { describe, expect, it } from "vitest";
import { esErrorDePeticionDemasiadoGrande } from "@/lib/assistantRun";

describe("esErrorDePeticionDemasiadoGrande", () => {
  it("reconoce el error real que vio un usuario en producción", () => {
    // Mensaje textual de Groq, tal cual llegó a Sentry.
    const err = new Error(
      "AI_APICallError: Request too large for model `openai/gpt-oss-120b` in organization " +
        "`org_01ksb17g4jf3pvrj352hff3ywp` service tier `on_demand` on tokens per minute (TPM): " +
        "Limit 8000, Requested 8267, please reduce your message size and try again.",
    );
    expect(esErrorDePeticionDemasiadoGrande(err)).toBe(true);
  });

  it("no confunde un fallo de red normal con un límite de tamaño", () => {
    expect(esErrorDePeticionDemasiadoGrande(new Error("fetch failed"))).toBe(false);
    expect(esErrorDePeticionDemasiadoGrande(new Error("ECONNRESET"))).toBe(false);
  });

  it("no revienta con algo que no es un Error", () => {
    expect(esErrorDePeticionDemasiadoGrande("tokens per minute")).toBe(true);
    expect(esErrorDePeticionDemasiadoGrande(null)).toBe(false);
    expect(esErrorDePeticionDemasiadoGrande(undefined)).toBe(false);
  });
});
