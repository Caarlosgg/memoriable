const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const FALLBACK = "Fecha desconocida";

/**
 * Formatea una fecha sin lanzar nunca. Acepta también el string ISO que
 * llega tras cruzar un límite de JSON (p. ej. fetch a /api/search: un Date
 * se serializa a string y deja de ser instancia de Date, aunque el tipo
 * `Message` siga diciendo `Date`) — de ahí el `RangeError: Invalid time
 * value` si se le pasa directo a Intl.DateTimeFormat. Cualquier valor nulo,
 * vacío o no parseable cae al texto de reserva.
 */
export function formatDate(fecha: Date | string | number | null | undefined): string {
  if (fecha == null || fecha === "") return FALLBACK;
  const date = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(date.getTime())) return FALLBACK;
  return DATE_FORMATTER.format(date);
}
