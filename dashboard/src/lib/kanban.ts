import type { EstadoTarea, Prioridad } from "@prisma/client";
import { Circle, CircleDot, CircleCheckBig, Flag, type LucideIcon } from "lucide-react";
import { isCategory, type Category } from "./categories";

/** Columnas del tablero, de izquierda a derecha. Única fuente de verdad del orden. */
export const ESTADOS_TABLERO: readonly EstadoTarea[] = ["POR_HACER", "EN_PROGRESO", "HECHO"] as const;

export const ESTADO_PRESENTATION: Record<EstadoTarea, { label: string; Icon: LucideIcon }> = {
  POR_HACER: { label: "Por hacer", Icon: Circle },
  EN_PROGRESO: { label: "En progreso", Icon: CircleDot },
  HECHO: { label: "Hecho", Icon: CircleCheckBig },
};

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

export interface BoardFilters {
  categoria?: string;
  prioridad?: Prioridad;
}

/**
 * Filtros del tablero recordados por usuario (`User.preferenciasTablero`,
 * JSON libre). Pura y defensiva: valida cada campo antes de confiar en él,
 * porque el JSON pudo quedar de una versión anterior de la app o estar
 * corrupto — nunca debe tumbar el render del tablero.
 */
export function readBoardFilters(value: unknown): { categoria?: Category; prioridad?: Prioridad } {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  const categoria = typeof raw.categoria === "string" && isCategory(raw.categoria) ? raw.categoria : undefined;
  const prioridad =
    typeof raw.prioridad === "string" && (PRIORIDADES as readonly string[]).includes(raw.prioridad)
      ? (raw.prioridad as Prioridad)
      : undefined;
  return { categoria, prioridad };
}
