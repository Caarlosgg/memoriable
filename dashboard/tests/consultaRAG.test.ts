import { describe, expect, it } from "vitest";
import { construirConsultaRAG } from "@/lib/assistantRun";

describe("construirConsultaRAG", () => {
  it("una pregunta de seguimiento arrastra la anterior como contexto", () => {
    // El bug real: tras "¿qué tengo esta semana?", un "¿y el jueves?" se
    // embebía SOLO, se convertía en un vector que no se parece a ninguna
    // nota concreta, y el Asistente recuperaba ruido justo cuando el
    // usuario estaba profundizando.
    const consulta = construirConsultaRAG([
      "¿qué reuniones tengo esta semana?",
      "¿y el jueves?",
    ]);

    expect(consulta).toBe("¿qué reuniones tengo esta semana? ¿y el jueves?");
  });

  it("una pregunta larga se basta sola: ya lleva sus propias palabras clave", () => {
    const larga = "¿qué apunté sobre el presupuesto del obrador y los plazos de entrega?";
    expect(construirConsultaRAG(["algo anterior", larga])).toBe(larga);
  });

  it("la primera pregunta de la conversación va sola, no hay nada que arrastrar", () => {
    expect(construirConsultaRAG(["¿y esto?"])).toBe("¿y esto?");
  });

  it("sin preguntas devuelve vacío en vez de romper", () => {
    expect(construirConsultaRAG([])).toBe("");
    expect(construirConsultaRAG(["  ", ""])).toBe("");
  });

  it("ignora los huecos en blanco al buscar la anterior", () => {
    expect(construirConsultaRAG(["el presupuesto del obrador", "   ", "¿y eso?"])).toBe(
      "el presupuesto del obrador ¿y eso?",
    );
  });

  it("el contexto va DELANTE: es el tema, y la última pregunta lo matiza", () => {
    const consulta = construirConsultaRAG(["reunión con el cliente", "¿cuándo?"]);
    expect(consulta.indexOf("reunión")).toBeLessThan(consulta.indexOf("¿cuándo?"));
  });
});
