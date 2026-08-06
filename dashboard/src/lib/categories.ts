import { CheckSquare, Lightbulb, HelpCircle, Bell, StickyNote, Archive, type LucideIcon } from "lucide-react";

/**
 * Categorías posibles de un mensaje. Metadato de presentación propio del
 * dashboard (no se importa del bot: son apps independientes desplegadas por
 * separado); el valor real vive en la columna `categoria` de Postgres, que
 * ambas apps comparten vía el mismo schema de Prisma.
 */
export const CATEGORIES = [
  "tarea",
  "idea",
  "pregunta",
  "recordatorio",
  "nota",
  "otro",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Un icono lineal (lucide-react) por categoría, nunca con color propio: el
 * color viene siempre de la paleta de la categoría (`color`/`colorSoft`,
 * clases de Tailwind ligadas a los tokens `--cat-*` de globals.css), nunca
 * del icono en sí — así el mismo trazo sirve en cualquier contexto.
 */
export const CATEGORY_PRESENTATION: Record<
  Category,
  { Icon: LucideIcon; label: string; color: string; colorSoft: string; borderAccent: string }
> = {
  tarea: {
    Icon: CheckSquare,
    label: "Tareas",
    color: "text-cat-tarea",
    colorSoft: "bg-cat-tarea-soft",
    borderAccent: "border-l-cat-tarea",
  },
  idea: {
    Icon: Lightbulb,
    label: "Ideas",
    color: "text-cat-idea",
    colorSoft: "bg-cat-idea-soft",
    borderAccent: "border-l-cat-idea",
  },
  pregunta: {
    Icon: HelpCircle,
    label: "Preguntas",
    color: "text-cat-pregunta",
    colorSoft: "bg-cat-pregunta-soft",
    borderAccent: "border-l-cat-pregunta",
  },
  recordatorio: {
    Icon: Bell,
    label: "Recordatorios",
    color: "text-cat-recordatorio",
    colorSoft: "bg-cat-recordatorio-soft",
    borderAccent: "border-l-cat-recordatorio",
  },
  nota: {
    Icon: StickyNote,
    label: "Notas",
    color: "text-cat-nota",
    colorSoft: "bg-cat-nota-soft",
    borderAccent: "border-l-cat-nota",
  },
  otro: {
    Icon: Archive,
    label: "Sin categorizar",
    color: "text-cat-otro",
    colorSoft: "bg-cat-otro-soft",
    borderAccent: "border-l-cat-otro",
  },
};

export function presentCategory(categoria: string) {
  return isCategory(categoria)
    ? CATEGORY_PRESENTATION[categoria]
    : CATEGORY_PRESENTATION.otro;
}

/** Categorías "accionables": las únicas que pueden estar pendientes/hechas. */
export const ACTIONABLE_CATEGORIES = ["tarea", "recordatorio"] as const;
