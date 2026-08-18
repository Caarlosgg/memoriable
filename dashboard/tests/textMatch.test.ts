import { describe, expect, it } from "vitest";
import { normalizeForMatch, matchPersonaPorEmail } from "../src/lib/textMatch";

describe("normalizeForMatch", () => {
  it("quita tildes y mayúsculas, para que 'Reunión' y 'reunion' coincidan", () => {
    expect(normalizeForMatch("  Reunión ")).toBe("reunion");
  });
});

/**
 * El criterio de "cómo se llama esta persona" que comparten la asignación
 * de tareas (`resolverMiembro`) y las consultas del Asistente sobre gente
 * (`consultarPersona`/`consultarAgenda`). Se prueba aquí, en el módulo puro
 * donde vive, en vez de a través de `assistantTools` — así estos tests no
 * arrastran Prisma, Groq ni el resto del grafo del Asistente.
 */
describe("matchPersonaPorEmail", () => {
  const personas = [
    { userId: "u-benito", email: "benitoelrey@example.com" },
    { userId: "u-ana", email: "ana.garcia@example.com" },
  ];

  it("resuelve por email completo (sin importar mayúsculas)", () => {
    expect(matchPersonaPorEmail("BenitoElRey@example.com", personas)).toMatchObject({ userId: "u-benito" });
  });

  it("resuelve por la parte local del email (lo que la gente usa como 'nombre')", () => {
    expect(matchPersonaPorEmail("benitoelrey", personas)).toMatchObject({ userId: "u-benito" });
  });

  it("resuelve por coincidencia parcial en cualquier sentido (apodo corto)", () => {
    expect(matchPersonaPorEmail("ana", personas)).toMatchObject({ userId: "u-ana" });
  });

  it("ignora tildes/mayúsculas al comparar", () => {
    const conTilde = [{ userId: "u-x", email: "maría@example.com" }];
    expect(matchPersonaPorEmail("Maria", conTilde)).toMatchObject({ userId: "u-x" });
  });

  it("una coincidencia exacta de la parte local gana a una parcial anterior en la lista (no depende del orden)", () => {
    // Bug real encontrado en revisión de código: antes, la comprobación
    // exacta y la parcial vivían en el mismo `.find()`, así que si
    // "ana.garcia@..." aparecía ANTES que "ana@..." en la lista,
    // `.includes("ana")` la hacía ganar por delante de la coincidencia
    // exacta — asignando en silencio a la persona equivocada.
    const conAmbas = [
      { userId: "u-ana-garcia", email: "ana.garcia@example.com" },
      { userId: "u-ana", email: "ana@example.com" },
    ];
    expect(matchPersonaPorEmail("ana", conAmbas)).toMatchObject({ userId: "u-ana" });
  });

  it("devuelve null si nadie encaja — nunca elige 'a lo que más se parezca' sin overlap real", () => {
    expect(matchPersonaPorEmail("pedro", personas)).toBeNull();
  });

  it("devuelve null con una cadena vacía", () => {
    expect(matchPersonaPorEmail("   ", personas)).toBeNull();
  });
});
