import { describe, expect, it } from "vitest";
import { saludoSegunHora } from "@/components/inicio/Saludo";

describe("saludoSegunHora", () => {
  it("saluda según el tramo del día", () => {
    expect(saludoSegunHora(3)).toBe("Buenas noches");
    expect(saludoSegunHora(9)).toBe("Buenos días");
    expect(saludoSegunHora(16)).toBe("Buenas tardes");
    expect(saludoSegunHora(23)).toBe("Buenas noches");
  });

  it("los bordes caen del lado correcto", () => {
    expect(saludoSegunHora(6)).toBe("Buenos días");
    expect(saludoSegunHora(13)).toBe("Buenos días");
    expect(saludoSegunHora(14)).toBe("Buenas tardes");
    expect(saludoSegunHora(20)).toBe("Buenas tardes");
    expect(saludoSegunHora(21)).toBe("Buenas noches");
  });

  it("la 01:30 es de noche — el caso que el cálculo en servidor rompía", () => {
    // El servidor está en UTC: a la 01:30 en España su reloj marcaba las
    // 23:30 del día ANTERIOR, así que salía el saludo y la fecha de ayer.
    // Ahora la hora la pone el navegador, que sí sabe dónde está el usuario.
    expect(saludoSegunHora(1)).toBe("Buenas noches");
  });
});
