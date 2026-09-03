/**
 * Exporta eventos a iCalendar (RFC 5545) — el formato que entienden Google
 * Calendar, Apple Calendar y Outlook.
 *
 * Es lo que hace que el calendario sirva fuera de la app: sin esto, lo que
 * capturas por Telegram vive solo aquí dentro, y nadie va a mirar dos
 * calendarios.
 *
 * Sin dependencias: el formato son líneas `CLAVE:valor`, y una librería
 * para eso serían 40 KB por escribir ocho campos.
 */

export interface EventoICS {
  id: string;
  titulo: string;
  descripcion?: string | null;
  ubicacion?: string | null;
  fechaInicio: Date;
  fechaFin?: Date | null;
}

/** Duración por defecto cuando un evento no tiene fin: una hora. */
const DURACION_POR_DEFECTO_MS = 60 * 60 * 1000;

/** `20260903T140000Z` — iCalendar en UTC, que es lo que evita ambigüedades de zona. */
function formatearFecha(fecha: Date): string {
  return `${fecha.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Escapa según RFC 5545: la coma, el punto y coma y la barra invertida son
 * separadores dentro de un valor, y un salto de línea partiría la línea en
 * dos propiedades. Sin esto, un evento titulado "Reunión: precios, plazos"
 * rompe el archivo entero para el resto de eventos.
 */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Pliega las líneas a 75 octetos, como exige el RFC: las continuaciones
 * empiezan por un espacio. Se mide en BYTES y no en caracteres porque el
 * límite es de octetos — con acentos y emojis, contar caracteres se pasa
 * de largo y algunos clientes rechazan el archivo.
 */
function plegar(linea: string): string {
  const bytes = Buffer.from(linea, "utf8");
  if (bytes.length <= 75) return linea;

  const trozos: string[] = [];
  let inicio = 0;
  while (inicio < bytes.length) {
    // 74 en las continuaciones para dejar sitio al espacio inicial.
    const max = trozos.length === 0 ? 75 : 74;
    let fin = Math.min(inicio + max, bytes.length);
    // No partir a mitad de un carácter multibyte: se retrocede hasta el
    // principio de la secuencia (los bytes de continuación son 10xxxxxx).
    while (fin < bytes.length && (bytes[fin]! & 0xc0) === 0x80) fin--;
    trozos.push(bytes.subarray(inicio, fin).toString("utf8"));
    inicio = fin;
  }
  return trozos.join("\r\n ");
}

/**
 * Genera el archivo `.ics` completo.
 *
 * `dominio` entra en el UID de cada evento: el UID debe ser único en el
 * mundo, y usar solo el cuid haría que dos instalaciones distintas de
 * MemorIAble generasen UIDs que un cliente de calendario podría confundir.
 */
export function eventosToICS(eventos: readonly EventoICS[], dominio = "memoriable.app"): string {
  const ahora = formatearFecha(new Date());

  const lineas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MemorIAble//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const evento of eventos) {
    const fin = evento.fechaFin ?? new Date(evento.fechaInicio.getTime() + DURACION_POR_DEFECTO_MS);
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${evento.id}@${dominio}`,
      // DTSTAMP es cuándo se generó el archivo; DTSTART, cuándo es el
      // evento. Un cliente que no vea DTSTAMP puede rechazar el VEVENT.
      `DTSTAMP:${ahora}`,
      `DTSTART:${formatearFecha(evento.fechaInicio)}`,
      `DTEND:${formatearFecha(fin)}`,
      plegar(`SUMMARY:${escapar(evento.titulo)}`),
    );
    if (evento.descripcion) lineas.push(plegar(`DESCRIPTION:${escapar(evento.descripcion)}`));
    if (evento.ubicacion) lineas.push(plegar(`LOCATION:${escapar(evento.ubicacion)}`));
    lineas.push("END:VEVENT");
  }

  lineas.push("END:VCALENDAR");
  // CRLF obligatorio por el RFC, y con salto final: varios clientes
  // descartan en silencio el último VEVENT si el archivo no lo lleva.
  return `${lineas.join("\r\n")}\r\n`;
}
