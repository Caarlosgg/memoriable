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

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Fecha/hora de un evento del calendario, en la zona horaria REAL del
 * navegador (a diferencia de `formatDate`, que fuerza UTC a propósito para
 * que el servidor y el cliente pinten el mismo texto en el primer render y
 * no rompan la hidratación). Para un evento la hora exacta importa de
 * verdad, así que solo se usa donde no hay ese riesgo: dentro de un modal
 * que empieza cerrado (nada que hidratar hasta que el usuario lo abre).
 */
export function formatEventDate(fecha: Date | string | number | null | undefined): string {
  if (fecha == null || fecha === "") return FALLBACK;
  const date = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(date.getTime())) return FALLBACK;
  return EVENT_DATE_FORMATTER.format(date);
}

const EVENT_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  // UTC forzado, no la hora real del navegador (a diferencia de
  // formatEventDate): esto se pinta en los chips del mes SIEMPRE visibles
  // (no dentro de un modal que arranca cerrado), así que corre el mismo
  // riesgo de desajuste de hidratación que formatDate — mismo motivo, misma
  // solución.
  timeZone: "UTC",
});

/** Solo la hora (HH:mm) de un evento — para los chips del calendario, donde no cabe la fecha entera. */
export function formatEventTime(fecha: Date | string | number | null | undefined): string {
  if (fecha == null || fecha === "") return "";
  const date = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(date.getTime())) return "";
  return EVENT_TIME_FORMATTER.format(date);
}

/**
 * Parte local de un email (antes de la @), para mostrar un "nombre" corto
 * sin tener que pedirle a cada usuario que rellene uno — reutilizado por
 * cualquier sitio que muestre quién es alguien en un espacio compacto
 * (tarjeta del tablero, barra "en curso ahora", tarjetas del Asistente).
 * Único sitio: antes cada componente tenía su propia copia idéntica.
 */
export function shortEmailName(email: string): string {
  return email.split("@")[0] ?? email;
}
