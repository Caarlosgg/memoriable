import type { EstadoTarea, Prioridad } from "@prisma/client";
import { Circle, CircleDot, CircleCheckBig, Flag, type LucideIcon } from "lucide-react";

/** Columnas del tablero, de izquierda a derecha. Única fuente de verdad del orden. */
export const ESTADOS_TABLERO: readonly EstadoTarea[] = ["POR_HACER", "EN_PROGRESO", "HECHO"] as const;

export const ESTADO_PRESENTATION: Record<EstadoTarea, { label: string; Icon: LucideIcon }> = {
  POR_HACER: { label: "Por hacer", Icon: Circle },
  EN_PROGRESO: { label: "En progreso", Icon: CircleDot },
  HECHO: { label: "Hecho", Icon: CircleCheckBig },
};

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
