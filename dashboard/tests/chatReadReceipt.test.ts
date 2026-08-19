import { describe, expect, it } from "vitest";
import { contarVistos, textoVisto } from "../src/lib/chatReadReceipt";

const ENVIADO = "2026-08-19T10:00:00.000Z";
const ANTES = "2026-08-19T09:59:59.000Z";
const DESPUES = "2026-08-19T10:00:01.000Z";

describe("contarVistos", () => {
  it("cuenta a quien leyó en el mismo instante o después", () => {
    const participants = [
      { userId: "yo", lastReadAt: DESPUES },
      { userId: "ana", lastReadAt: DESPUES },
      { userId: "carlos", lastReadAt: ENVIADO },
    ];
    // El autor no se cuenta a sí mismo aunque su lastReadAt sea posterior.
    expect(contarVistos(participants, "yo", ENVIADO)).toBe(2);
  });

  it("no cuenta a quien leyó ANTES de que se enviara", () => {
    const participants = [{ userId: "ana", lastReadAt: ANTES }];
    expect(contarVistos(participants, "yo", ENVIADO)).toBe(0);
  });

  it("no cuenta a quien no ha abierto nunca la conversación", () => {
    // `null` no es "aún no lo ha visto": es que no ha entrado nunca.
    const participants = [{ userId: "ana", lastReadAt: null }];
    expect(contarVistos(participants, "yo", ENVIADO)).toBe(0);
  });

  it("ante una fecha ilegible devuelve 0 en vez de contar de más", () => {
    const participants = [{ userId: "ana", lastReadAt: "no-es-una-fecha" }];
    expect(contarVistos(participants, "yo", ENVIADO)).toBe(0);
    expect(contarVistos(participants, "yo", "tampoco")).toBe(0);
  });
});

describe("textoVisto", () => {
  it("en una conversación de dos dice «Visto», sin número", () => {
    const participants = [
      { userId: "yo", lastReadAt: DESPUES },
      { userId: "ana", lastReadAt: DESPUES },
    ];
    expect(textoVisto(participants, "yo", ENVIADO, false)).toBe("Visto");
  });

  it("en un grupo dice por cuánta gente, que es lo que se quiere saber ahí", () => {
    const participants = [
      { userId: "yo", lastReadAt: DESPUES },
      { userId: "ana", lastReadAt: DESPUES },
      { userId: "carlos", lastReadAt: DESPUES },
    ];
    expect(textoVisto(participants, "yo", ENVIADO, true)).toBe("Visto por 2");
  });

  it("si todavía no lo ha leído nadie no dice nada, en vez de «Visto por 0»", () => {
    const participants = [{ userId: "ana", lastReadAt: ANTES }];
    expect(textoVisto(participants, "yo", ENVIADO, false)).toBeNull();
    expect(textoVisto(participants, "yo", ENVIADO, true)).toBeNull();
  });
});
