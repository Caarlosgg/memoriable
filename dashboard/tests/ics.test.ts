import { describe, expect, it } from "vitest";
import { eventosToICS, type EventoICS } from "@/lib/ics";

function evento(over: Partial<EventoICS> = {}): EventoICS {
  return {
    id: "ev1",
    titulo: "Reunión",
    fechaInicio: new Date("2026-09-03T14:00:00.000Z"),
    ...over,
  };
}

describe("eventosToICS", () => {
  it("genera un calendario válido con la envoltura obligatoria", () => {
    const ics = eventosToICS([evento()]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("usa CRLF: el RFC lo exige y algunos clientes rechazan LF a secas", () => {
    const ics = eventosToICS([evento()]);
    expect(ics).toContain("\r\n");
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("escapa comas y puntos y coma — sin eso un título rompe el archivo ENTERO", () => {
    // "Reunión: precios, plazos" partiría el valor en dos propiedades y el
    // cliente descartaría el resto de eventos, no solo este.
    const ics = eventosToICS([evento({ titulo: "Precios, plazos; y más" })]);
    expect(ics).toContain("SUMMARY:Precios\\, plazos\\; y más");
  });

  it("escapa los saltos de línea de la descripción", () => {
    const ics = eventosToICS([evento({ descripcion: "línea uno\nlínea dos" })]);
    expect(ics).toContain("DESCRIPTION:línea uno\\nlínea dos");
  });

  it("sin fechaFin da una hora de duración, no un evento sin fin", () => {
    const ics = eventosToICS([evento()]);
    expect(ics).toContain("DTSTART:20260903T140000Z");
    expect(ics).toContain("DTEND:20260903T150000Z");
  });

  it("respeta la fechaFin cuando la hay", () => {
    const ics = eventosToICS([evento({ fechaFin: new Date("2026-09-03T16:30:00.000Z") })]);
    expect(ics).toContain("DTEND:20260903T163000Z");
  });

  it("omite descripción y ubicación cuando no las hay, en vez de dejarlas vacías", () => {
    const ics = eventosToICS([evento()]);
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
  });

  it("el UID lleva dominio: debe ser único en el mundo, no solo en esta base de datos", () => {
    expect(eventosToICS([evento()])).toContain("UID:ev1@memoriable.app");
  });

  it("pliega las líneas largas a 75 octetos, contando BYTES y no caracteres", () => {
    // Con acentos, contar caracteres se pasa del límite y algunos clientes
    // rechazan el archivo.
    const ics = eventosToICS([evento({ titulo: "á".repeat(120) })]);
    for (const linea of ics.split("\r\n")) {
      expect(Buffer.from(linea, "utf8").length).toBeLessThanOrEqual(75);
    }
  });

  it("no parte un carácter multibyte por la mitad al plegar", () => {
    const titulo = "ñ".repeat(100);
    const ics = eventosToICS([evento({ titulo })]);
    // Al deshacer el plegado debe salir el título intacto.
    const desplegado = ics.replace(/\r\n /g, "");
    expect(desplegado).toContain(`SUMMARY:${titulo}`);
  });

  it("un calendario vacío sigue siendo un archivo válido", () => {
    const ics = eventosToICS([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
