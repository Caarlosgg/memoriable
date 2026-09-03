import { env } from '../config/env.js';
import type { Analysis, Category } from '../ai/types.js';

/** Presentación (emoji + etiqueta) de cada categoría en la tarjeta de Telegram. */
const CATEGORY_PRESENTATION: Record<Category, { emoji: string; label: string }> = {
  tarea: { emoji: '✅', label: 'Tarea' },
  idea: { emoji: '💡', label: 'Idea' },
  pregunta: { emoji: '❓', label: 'Pregunta' },
  recordatorio: { emoji: '⏰', label: 'Recordatorio' },
  nota: { emoji: '📝', label: 'Nota' },
  // "otro" es la categoría de reserva (sin match claro): se muestra sin forzar
  // una etiqueta rara, tal cual pide el producto.
  otro: { emoji: '🗂️', label: 'Sin categorizar' },
};

/** Columna del tablero, para que la tarjeta de Telegram diga lo mismo que la web. */
const ESTADO_PRESENTATION: Record<string, string> = {
  POR_HACER: '📥 Por hacer',
  EN_PROGRESO: '🔄 En progreso',
  HECHO: '✅ Hecho',
};

// `timeZone` desde la configuración, NUNCA 'UTC' fijo: enseñar UTC a un
// usuario español le pintaba cada nota una o dos horas antes de cuando la
// escribió (ver DEFAULT_BOT_TIMEZONE).
const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: env.BOT_TIMEZONE,
});

/** La fecha límite se enseña sin hora: lo que importa es el día. */
const DEADLINE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: env.BOT_TIMEZONE,
});

/** Escapa los caracteres especiales de Telegram HTML (contenido no controlado por nosotros). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ResponseCardData extends Analysis {
  fecha: Date;
  /** Id de la nota, para poder enlazarla en el dashboard. Sin él, no hay enlace. */
  id?: string;
  /** Email de quien la creó, si es una tarea asignada por otra persona (ver StoredMessage.asignadaPor). */
  asignadaPor?: string;
  /**
   * Nombre del espacio de EQUIPO donde vive (ver StoredMessage.workspaceNombre).
   * Ausente para el espacio personal: repetirlo en cada nota sería ruido, lo
   * que hay que avisar es cuando NO va al sitio de siempre.
   */
  workspaceNombre?: string;
  /** Fecha límite, si la tiene. */
  fechaLimite?: Date | null;
  /** Columna del tablero (`EstadoTarea`), solo relevante en accionables. */
  estado?: string | null;
  /** A quién está asignada, ya resuelto a algo legible por quien llama. */
  asignadaA?: string;
  /**
   * Nombre (y emoji) de la etiqueta propia, ya resuelta por quien llama —
   * ver `StoredMessage.customCategoryId`. `formatResponseCard` no consulta
   * la base de datos por su cuenta: el llamante ya tenía la lista de
   * categorías propias del usuario para pintar el selector, así que
   * resolverlo aquí sería una segunda consulta redundante.
   */
  categoriaPersonalizada?: { nombre: string; emoji: string | null };
}

/** Nunca lanza: una fecha corrupta no debe tumbar la respuesta al usuario. */
function formatFecha(fecha: Date, formatter = DATE_FORMATTER): string {
  if (Number.isNaN(fecha.getTime())) return 'fecha desconocida';
  return formatter.format(fecha);
}

/**
 * Formatea el resultado de un mensaje procesado como una tarjeta en HTML de
 * Telegram (`parse_mode: 'HTML'`): categoría en negrita con emoji temático,
 * resumen debajo y los datos que de verdad hacen falta para no tener que
 * abrir el dashboard a comprobar nada.
 *
 * Las líneas opcionales solo salen cuando aportan algo: una tarjeta con seis
 * líneas fijas, la mitad vacías o repitiendo el valor por defecto, se deja
 * de leer.
 */
export function formatResponseCard({
  id,
  categoria,
  resumen,
  fecha,
  asignadaPor,
  workspaceNombre,
  fechaLimite,
  estado,
  asignadaA,
  categoriaPersonalizada,
}: ResponseCardData): string {
  const { emoji, label } = CATEGORY_PRESENTATION[categoria] ?? CATEGORY_PRESENTATION.otro;
  const resumenLimpio = escapeHtml(resumen.trim()) || '(sin resumen)';

  const lineas = [`${emoji} <b>${label}</b>`, resumenLimpio, `🕒 ${formatFecha(fecha)}`];

  // Solo si NO es el espacio personal: es la línea que responde a "¿esto lo
  // va a ver mi equipo?" — la duda que hacía inservible dictar al bot
  // trabajando en equipo.
  if (workspaceNombre) lineas.push(`🏢 Guardado en <b>${escapeHtml(workspaceNombre)}</b>`);

  if (fechaLimite) lineas.push(`📅 Para el ${formatFecha(fechaLimite, DEADLINE_FORMATTER)}`);
  // "Por hacer" es el valor por defecto de toda nota accionable recién
  // creada: decirlo no informa de nada. Solo se enseña cuando ya se movió.
  if (estado && estado !== 'POR_HACER' && ESTADO_PRESENTATION[estado]) {
    lineas.push(ESTADO_PRESENTATION[estado]!);
  }
  if (asignadaA) lineas.push(`🙋 Asignada a ${escapeHtml(asignadaA)}`);

  // La etiqueta propia va APARTE de la categoría fija (nunca la sustituye
  // — ver el comentario de Message.customCategoryId), así que se enseña
  // como una línea más, no cambiando la cabecera de arriba.
  if (categoriaPersonalizada) {
    const prefijo = categoriaPersonalizada.emoji ? `${categoriaPersonalizada.emoji} ` : '🏷️ ';
    lineas.push(`${prefijo}${escapeHtml(categoriaPersonalizada.nombre)}`);
  }
  // Solo en tareas que otra persona te ha asignado — sin esto, verla en tu
  // /pendientes sin más contexto parece una tarea que no recuerdas haber
  // escrito tú mismo.
  if (asignadaPor) lineas.push(`👤 Asignada por ${escapeHtml(asignadaPor)}`);

  // Enlace al final y solo si hay DASHBOARD_URL configurada: nunca una URL
  // inventada, que sería peor que no ofrecer enlace.
  if (id && env.DASHBOARD_URL) {
    const base = env.DASHBOARD_URL.replace(/\/+$/, '');
    // `?mensaje=` y no `?nota=`: es el parámetro que ya entiende /notas para
    // resaltar una nota concreta (ver NotasPage y NotesSection.highlightId).
    lineas.push(`<a href="${base}/notas?mensaje=${encodeURIComponent(id)}">Abrir en el dashboard</a>`);
  }

  return lineas.join('\n');
}
