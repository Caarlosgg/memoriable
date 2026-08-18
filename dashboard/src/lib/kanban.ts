import type { EstadoTarea, Prioridad } from "@prisma/client";
import { Circle, CircleDot, CircleCheckBig, Flag, type LucideIcon } from "lucide-react";
import { esAccionable } from "./categories";

/** Columnas del tablero, de izquierda a derecha. Única fuente de verdad del orden. */
export const ESTADOS_TABLERO: readonly EstadoTarea[] = ["POR_HACER", "EN_PROGRESO", "HECHO"] as const;

/**
 * `color`/`colorSoft` reutilizan los mismos tokens que `PRIORIDAD_PRESENTATION`
 * — sin colores nuevos. EN_PROGRESO usa el mismo verde que `WorkingOnControl`
 * ya usa para "en curso" (coherencia con ese indicador); HECHO usa su
 * versión sólida (lectura clara de "completado"); POR_HACER se queda
 * neutro, como estaba.
 */
export const ESTADO_PRESENTATION: Record<EstadoTarea, { label: string; Icon: LucideIcon; color: string; colorSoft: string }> = {
  POR_HACER: { label: "Por hacer", Icon: Circle, color: "text-muted", colorSoft: "bg-paper-line/60" },
  EN_PROGRESO: { label: "En progreso", Icon: CircleDot, color: "text-accent-strong", colorSoft: "bg-accent-soft" },
  HECHO: { label: "Hecho", Icon: CircleCheckBig, color: "text-accent-ink", colorSoft: "bg-accent-strong" },
};

/**
 * Vistas rápidas del tablero, seleccionables por URL (`/pendientes?vista=`).
 * Existen para que las cifras de la pantalla de inicio sean un ACCESO y no
 * solo un dato: antes "Vencidas 3" y "Pendientes 12" llevaban las dos al
 * mismo tablero sin filtrar, y había que volver a buscar a ojo aquello que
 * el número acababa de señalar.
 */
export const VISTAS_TABLERO = ["todas", "vencidas", "hoy", "mias"] as const;
export type VistaTablero = (typeof VISTAS_TABLERO)[number];

export const VISTA_LABEL: Record<VistaTablero, string> = {
  todas: "Todo el tablero",
  vencidas: "Solo vencidas",
  hoy: "Vencen hoy",
  mias: "Asignadas a mí",
};

/** Valida lo que venga por la URL — cualquier otra cosa cae en "todas" en vez de dejar el tablero vacío. */
export function parseVista(value: string | undefined): VistaTablero {
  return (VISTAS_TABLERO as readonly string[]).includes(value ?? "") ? (value as VistaTablero) : "todas";
}

/**
 * ¿Entra esta tarjeta en la vista elegida? Pura, para poder probar los
 * límites de día sin montar el tablero — que es donde está el riesgo real
 * (una tarea que vence hoy no debe contar como vencida, y "hoy" es el día
 * natural del usuario, no las próximas 24 horas).
 */
export function matchesVista(
  message: { fechaLimite: Date | null; assigneeId: string | null },
  vista: VistaTablero,
  currentUserId: string,
  now: Date = new Date(),
): boolean {
  if (vista === "todas") return true;
  if (vista === "mias") return message.assigneeId === currentUserId;

  if (!message.fechaLimite) return false;
  const inicioHoy = new Date(now);
  inicioHoy.setHours(0, 0, 0, 0);
  if (vista === "vencidas") return message.fechaLimite < inicioHoy;

  const finHoy = new Date(inicioHoy);
  finHoy.setDate(finHoy.getDate() + 1);
  return message.fechaLimite >= inicioHoy && message.fechaLimite < finHoy;
}

/** Siguiente estado en el ciclo Por hacer → En progreso → Hecho → Por hacer. */
export function nextEstado(e: EstadoTarea): EstadoTarea {
  const i = ESTADOS_TABLERO.indexOf(e);
  return ESTADOS_TABLERO[(i + 1) % ESTADOS_TABLERO.length]!;
}

/** Prioridades en orden creciente — usado también para ciclar al hacer click. */
export const PRIORIDADES: readonly Prioridad[] = ["BAJA", "MEDIA", "ALTA"] as const;

export const PRIORIDAD_PRESENTATION: Record<Prioridad, { label: string; color: string; colorSoft: string }> = {
  BAJA: { label: "Baja", color: "text-muted", colorSoft: "bg-paper-line/60" },
  MEDIA: { label: "Media", color: "text-highlight-strong", colorSoft: "bg-highlight-soft" },
  ALTA: { label: "Alta", color: "text-danger", colorSoft: "bg-danger-soft" },
};

export const PRIORIDAD_ICON: LucideIcon = Flag;

/** Siguiente prioridad en el ciclo Baja → Media → Alta → Baja. */
export function nextPriority(p: Prioridad): Prioridad {
  const i = PRIORIDADES.indexOf(p);
  return PRIORIDADES[(i + 1) % PRIORIDADES.length]!;
}

/**
 * "En curso ahora" deja de tener sentido si la tarjeta se marca HECHA, o si
 * cambia a una categoría no accionable (deja de aparecer en el tablero —
 * ver `esAccionable` — así que nadie podría volver a soltarla desde ahí,
 * solo desde la barra "en curso ahora"). Único sitio para esta regla:
 * la usan tanto el servidor (`actions.ts`, al escribir en la BD) como el
 * estado optimista del cliente (`KanbanBoard.tsx`) — antes cada uno tenía
 * su propia copia de la misma condición, y una de ellas (el guardado desde
 * el modal de edición) se quedó sin ella, dejando tarjetas HECHAS
 * mostrándose como "Trabajando…" hasta recargar la página.
 */
export function shouldClearEnProgreso(estado: EstadoTarea | undefined, categoria?: string): boolean {
  if (estado === "HECHO") return true;
  if (categoria !== undefined && !esAccionable(categoria)) return true;
  return false;
}
