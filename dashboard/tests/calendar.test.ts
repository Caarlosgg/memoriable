import { describe, expect, it } from "vitest";
import { dateKey, groupByDay, groupByDayRange, buildMonthGrid, buildWeekGrid, upcomingRange, dayLabel, fechaRepeticion, layoutDayEvents, isOverdue, rangoCalendario } from "../src/lib/calendar";

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

describe("layoutDayEvents", () => {
  // Mismo día de referencia para todos los casos — solo importa la hora.
  function at(hhmm: string): Date {
    return new Date(`2026-08-12T${hhmm}:00.000Z`);
  }
  interface FakeEvent {
    id: string;
    start: Date;
    end: Date | null;
  }
  function evt(id: string, startHHMM: string, endHHMM: string | null): FakeEvent {
    return { id, start: at(startHHMM), end: endHHMM ? at(endHHMM) : null };
  }
  const getRange = (e: FakeEvent) => ({ start: e.start, end: e.end });

  it("un solo evento: minutos/duración correctos, un único carril", () => {
    const [result] = layoutDayEvents([evt("a", "10:00", "11:00")], getRange);
    expect(result).toMatchObject({ topMinutes: 600, durationMinutes: 60, lane: 0, lanesInDay: 1 });
  });

  it("sin fechaFin, usa la duración mínima (30 min)", () => {
    const [result] = layoutDayEvents([evt("a", "10:00", null)], getRange);
    expect(result.durationMinutes).toBe(30);
  });

  it("fechaFin anterior a fechaInicio (dato mal introducido): se trata como sin duración, no negativa", () => {
    const [result] = layoutDayEvents([evt("a", "10:00", "09:00")], getRange);
    expect(result.durationMinutes).toBe(30);
  });

  it("un evento muy corto se redondea a la duración mínima, para seguir siendo clicable", () => {
    const [result] = layoutDayEvents([evt("a", "10:00", "10:05")], getRange);
    expect(result.durationMinutes).toBe(30);
  });

  it("dos eventos que NO se solapan comparten el mismo carril (0) y lanesInDay=1", () => {
    const results = layoutDayEvents([evt("a", "09:00", "10:00"), evt("b", "10:00", "11:00")], getRange);
    expect(results.map((r) => r.lane)).toEqual([0, 0]);
    expect(results[0]!.lanesInDay).toBe(1);
  });

  it("dos eventos que SÍ se solapan van a carriles distintos y lanesInDay=2", () => {
    const results = layoutDayEvents([evt("a", "10:00", "11:00"), evt("b", "10:30", "11:30")], getRange);
    const byId = Object.fromEntries(results.map((r) => [(r.item as FakeEvent).id, r]));
    expect(byId.a!.lane).not.toBe(byId.b!.lane);
    expect(byId.a!.lanesInDay).toBe(2);
    expect(byId.b!.lanesInDay).toBe(2);
  });

  it("un tercer evento que solapa con los dos anteriores reutiliza un carril libre en cuanto se libera", () => {
    // a: 10-11, b: 10:30-11:30 (se solapan, carriles 0 y 1); c: 11:15-12:00 solo solapa con b, cabe en el carril de a (ya libre a las 11:00).
    const results = layoutDayEvents(
      [evt("a", "10:00", "11:00"), evt("b", "10:30", "11:30"), evt("c", "11:15", "12:00")],
      getRange,
    );
    const byId = Object.fromEntries(results.map((r) => [(r.item as FakeEvent).id, r]));
    expect(byId.a!.lane).toBe(0);
    expect(byId.b!.lane).toBe(1);
    expect(byId.c!.lane).toBe(0);
    expect(byId.a!.lanesInDay).toBe(2);
  });

  it("devuelve un array vacío para una lista vacía", () => {
    expect(layoutDayEvents([], getRange)).toEqual([]);
  });
});

describe("isOverdue", () => {
  const today = new Date("2026-08-11T09:00:00.000Z");

  it("un día anterior a hoy está vencido", () => {
    expect(isOverdue(new Date("2026-08-10T23:00:00.000Z"), today)).toBe(true);
  });

  it("hoy mismo NO cuenta como vencido, sea cual sea la hora", () => {
    expect(isOverdue(new Date("2026-08-11T00:00:00.000Z"), today)).toBe(false);
    expect(isOverdue(new Date("2026-08-11T23:59:00.000Z"), today)).toBe(false);
  });

  it("un día futuro no está vencido", () => {
    expect(isOverdue(new Date("2026-08-12T00:00:00.000Z"), today)).toBe(false);
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

describe("rangoCalendario", () => {
  it("cubre los meses de alrededor, alineado al día 1 (mismo criterio que la rejilla)", () => {
    const { desde, hasta } = rangoCalendario(new Date("2026-08-17T12:00:00.000Z"), 2);

    expect(desde.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    // Exclusivo: primer día del mes SIGUIENTE al último incluido (octubre).
    expect(hasta.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("cruza bien el cambio de año hacia atrás y hacia delante", () => {
    const { desde, hasta } = rangoCalendario(new Date("2026-01-10T00:00:00.000Z"), 2);

    expect(desde.toISOString()).toBe("2025-11-01T00:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});
