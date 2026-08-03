import { describe, expect, it } from "vitest";
import { groupExchangesByDay, type ExchangeLike } from "../src/lib/groupExchangesByDay";

const NOW = new Date("2026-08-10T12:00:00.000Z");

function exchange(id: string, fecha: string): ExchangeLike {
  return { id, pregunta: `pregunta ${id}`, respuesta: `respuesta ${id}`, fecha: new Date(fecha) };
}

describe("groupExchangesByDay", () => {
  it("agrupa por día UTC y etiqueta 'Hoy'/'Ayer' correctamente", () => {
    const groups = groupExchangesByDay(
      [exchange("a", "2026-08-10T09:00:00.000Z"), exchange("b", "2026-08-09T09:00:00.000Z")],
      NOW,
    );

    expect(groups.map((g) => g.label)).toEqual(["Hoy", "Ayer"]);
  });

  it("etiqueta un día más antiguo como DD/MM/YYYY", () => {
    const groups = groupExchangesByDay([exchange("a", "2026-07-28T09:00:00.000Z")], NOW);
    expect(groups[0]!.label).toBe("28/07/2026");
  });

  it("agrupa varios intercambios del mismo día juntos, en orden de llegada", () => {
    const groups = groupExchangesByDay(
      [
        exchange("a", "2026-08-10T09:00:00.000Z"),
        exchange("b", "2026-08-10T08:00:00.000Z"),
        exchange("c", "2026-08-09T09:00:00.000Z"),
      ],
      NOW,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]!.exchanges.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groups[1]!.exchanges.map((e) => e.id)).toEqual(["c"]);
  });

  it("no reordena: respeta el orden de entrada (se asume ya ordenado por fecha desc)", () => {
    const groups = groupExchangesByDay(
      [exchange("viejo-primero", "2026-08-09T09:00:00.000Z"), exchange("nuevo-despues", "2026-08-10T09:00:00.000Z")],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["Ayer", "Hoy"]);
  });

  it("devuelve un array vacío sin intercambios", () => {
    expect(groupExchangesByDay([], NOW)).toEqual([]);
  });
});
