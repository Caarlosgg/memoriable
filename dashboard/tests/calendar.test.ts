import { describe, expect, it } from "vitest";
import { dateKey, groupByDay, buildMonthGrid, upcomingRange, dayLabel } from "../src/lib/calendar";

describe("dateKey", () => {
  it("da la fecha en formato YYYY-MM-DD en UTC", () => {
    expect(dateKey(new Date("2026-08-05T23:30:00.000Z"))).toBe("2026-08-05");
  });
});

describe("groupByDay", () => {
  it("agrupa por día conservando el orden de inserción", () => {
    const items = [
      { id: "a", fecha: new Date("2026-08-05T10:00:00.000Z") },
      { id: "b", fecha: new Date("2026-08-06T10:00:00.000Z") },
      { id: "c", fecha: new Date("2026-08-05T18:00:00.000Z") },
    ];
    const grouped = groupByDay(items, (i) => i.fecha);
    expect([...grouped.keys()]).toEqual(["2026-08-05", "2026-08-06"]);
    expect(grouped.get("2026-08-05")!.map((i) => i.id)).toEqual(["a", "c"]);
    expect(grouped.get("2026-08-06")!.map((i) => i.id)).toEqual(["b"]);
  });

  it("devuelve un Map vacío para una lista vacía", () => {
    expect(groupByDay([], (i: { fecha: Date }) => i.fecha).size).toBe(0);
  });
});

describe("buildMonthGrid", () => {
  it("genera 42 días (6 semanas)", () => {
    expect(buildMonthGrid(2026, 7).length).toBe(42); // agosto 2026 (mes 0-indexado)
  });

  it("empieza en lunes", () => {
    const grid = buildMonthGrid(2026, 7);
    expect(grid[0]!.date.getUTCDay()).toBe(1); // 1 = lunes
  });

  it("marca inMonth solo para los días del mes pedido", () => {
    const grid = buildMonthGrid(2026, 7); // agosto 2026
    const inMonthCount = grid.filter((d) => d.inMonth).length;
    expect(inMonthCount).toBe(31); // agosto tiene 31 días
  });

  it("marca isToday solo en la fecha de referencia pasada", () => {
    const today = new Date("2026-08-15T12:00:00.000Z");
    const grid = buildMonthGrid(2026, 7, today);
    const todays = grid.filter((d) => d.isToday);
    expect(todays.length).toBe(1);
    expect(todays[0]!.date.getUTCDate()).toBe(15);
  });
});

describe("dayLabel", () => {
  const today = new Date("2026-08-05T12:00:00.000Z");

  it('devuelve "Hoy" para la fecha de hoy', () => {
    expect(dayLabel("2026-08-05", today)).toBe("Hoy");
  });

  it('devuelve "Mañana" para el día siguiente', () => {
    expect(dayLabel("2026-08-06", today)).toBe("Mañana");
  });

  it("devuelve el nombre del día para cualquier otra fecha", () => {
    const label = dayLabel("2026-08-12", today);
    expect(label).toContain("ago");
    expect(label).not.toBe("Hoy");
    expect(label).not.toBe("Mañana");
  });
});

describe("upcomingRange", () => {
  it("devuelve un rango de N días desde la medianoche UTC de hoy", () => {
    const today = new Date("2026-08-05T18:45:00.000Z");
    const { desde, hasta } = upcomingRange(7, today);
    expect(desde.toISOString()).toBe("2026-08-05T00:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-08-12T00:00:00.000Z");
  });
});
