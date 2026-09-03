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

/**
 * Cómo se llama alguien en pantalla. Prefiere el nombre real y se cae al
 * email troceado cuando no lo hay — las cuentas creadas antes de que el
 * registro pidiera nombre no tienen ninguno, y esas nunca deben mostrarse
 * en blanco.
 *
 * Usar SIEMPRE esto en vez de `shortEmailName` cuando se tenga el usuario
 * entero a mano; `shortEmailName` queda para donde solo llega el email.
 */
export function displayName(user: { nombre?: string | null; email: string }): string {
  return user.nombre?.trim() || shortEmailName(user.email);
}

/**
 * Fecha relativa corta ("hace 5 min").
 *
 * Cuando lo que importa es cuánto hace, no el instante exacto: en un hilo
 * de comentarios y en la bandeja de notificaciones, "03/09/2026, 11:15" no
 * responde a la pregunta que uno se hace al mirarlas.
 *
 * A partir de una semana se cae a la fecha: "hace 34 d" ya no ayuda a nadie
 * a situar nada.
 */
export function haceCuanto(fecha: string | Date, ahora: Date = new Date()): string {
  const date = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(date.getTime())) return "";

  const diff = ahora.getTime() - date.getTime();
  // Una fecha en el futuro (relojes desincronizados) no debe salir como
  // "hace -3 min": se trata como recién ocurrida.
  if (diff < 0) return "ahora mismo";

  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return `hace ${dias} d`;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
