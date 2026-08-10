import { describe, expect, it } from "vitest";
import { dateKey, groupByDay, groupByDayRange, buildMonthGrid, buildWeekGrid, upcomingRange, dayLabel, fechaRepeticion } from "../src/lib/calendar";

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

describe("groupByDayRange", () => {
  it("un item de un solo día (from === to) aparece solo bajo esa clave", () => {
    const items = [{ id: "a", from: new Date("2026-08-05T10:00:00.000Z"), to: new Date("2026-08-05T10:00:00.000Z") }];
    const grouped = groupByDayRange(items, (i) => ({ from: i.from, to: i.to }));
    expect([...grouped.keys()]).toEqual(["2026-08-05"]);
  });

  it("un item de varios días aparece bajo CADA día del rango, inclusive", () => {
    const items = [{ id: "vacaciones", from: new Date("2026-08-10T00:00:00.000Z"), to: new Date("2026-08-13T00:00:00.000Z") }];
    const grouped = groupByDayRange(items, (i) => ({ from: i.from, to: i.to }));
    expect([...grouped.keys()]).toEqual(["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]);
    for (const key of grouped.keys()) {
      expect(grouped.get(key)!.map((i) => i.id)).toEqual(["vacaciones"]);
    }
  });

  it("varios items pueden compartir el mismo día, conservando orden de inserción", () => {
    const items = [
      { id: "a", from: new Date("2026-08-05T00:00:00.000Z"), to: new Date("2026-08-06T00:00:00.000Z") },
      { id: "b", from: new Date("2026-08-06T00:00:00.000Z"), to: new Date("2026-08-06T00:00:00.000Z") },
    ];
    const grouped = groupByDayRange(items, (i) => ({ from: i.from, to: i.to }));
    expect(grouped.get("2026-08-06")!.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("un rango invertido (to antes que from, dato mal introducido) se trata como un solo día en vez de desaparecer", () => {
    const items = [{ id: "a", from: new Date("2026-08-10T00:00:00.000Z"), to: new Date("2026-08-01T00:00:00.000Z") }];
    const grouped = groupByDayRange(items, (i) => ({ from: i.from, to: i.to }));
    expect([...grouped.keys()]).toEqual(["2026-08-10"]);
  });

  it("un rango disparatadamente largo se recorta a un techo defensivo (no cuelga el render)", () => {
    const items = [{ id: "a", from: new Date("2020-01-01T00:00:00.000Z"), to: new Date("2030-01-01T00:00:00.000Z") }];
    const grouped = groupByDayRange(items, (i) => ({ from: i.from, to: i.to }));
    expect(grouped.size).toBeLessThanOrEqual(366);
  });

  it("devuelve un Map vacío para una lista vacía", () => {
    expect(groupByDayRange([], (i: { from: Date; to: Date }) => i).size).toBe(0);
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

describe("buildWeekGrid", () => {
  it("genera 7 días", () => {
    expect(buildWeekGrid(new Date("2026-08-12T12:00:00.000Z")).length).toBe(7);
  });

  it("empieza en lunes y termina en domingo, conteniendo la fecha pedida", () => {
    const grid = buildWeekGrid(new Date("2026-08-12T12:00:00.000Z")); // miércoles
    expect(grid[0]!.date.getUTCDay()).toBe(1);
    expect(grid[6]!.date.getUTCDay()).toBe(0);
    expect(grid.some((d) => dateKey(d.date) === "2026-08-12")).toBe(true);
  });

  it("marca isToday solo en la fecha de referencia pasada", () => {
    const today = new Date("2026-08-13T09:00:00.000Z");
    const grid = buildWeekGrid(new Date("2026-08-12T12:00:00.000Z"), today);
    const todays = grid.filter((d) => d.isToday);
    expect(todays.length).toBe(1);
    expect(dateKey(todays[0]!.date)).toBe("2026-08-13");
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

describe("fechaRepeticion", () => {
  const base = new Date("2026-08-06T09:00:00.000Z");

  it("i=0 devuelve la fecha base sin desplazar", () => {
    expect(fechaRepeticion(base, "SEMANAL", 0).toISOString()).toBe(base.toISOString());
  });

  it("DIARIA suma i días", () => {
    expect(fechaRepeticion(base, "DIARIA", 3).toISOString()).toBe("2026-08-09T09:00:00.000Z");
  });

  it("SEMANAL suma i semanas", () => {
    expect(fechaRepeticion(base, "SEMANAL", 2).toISOString()).toBe("2026-08-20T09:00:00.000Z");
  });

  it("QUINCENAL suma i quincenas", () => {
    expect(fechaRepeticion(base, "QUINCENAL", 2).toISOString()).toBe("2026-09-03T09:00:00.000Z");
  });

  it("MENSUAL suma i meses", () => {
    expect(fechaRepeticion(base, "MENSUAL", 2).toISOString()).toBe("2026-10-06T09:00:00.000Z");
  });

  it("no muta la fecha base", () => {
    const original = base.toISOString();
    fechaRepeticion(base, "SEMANAL", 3);
    expect(base.toISOString()).toBe(original);
  });
});
