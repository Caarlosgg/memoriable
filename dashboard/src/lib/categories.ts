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

export const CATEGORY_PRESENTATION: Record<
  Category,
  { emoji: string; label: string }
> = {
  tarea: { emoji: "✅", label: "Tareas" },
  idea: { emoji: "💡", label: "Ideas" },
  pregunta: { emoji: "❓", label: "Preguntas" },
  recordatorio: { emoji: "⏰", label: "Recordatorios" },
  nota: { emoji: "📝", label: "Notas" },
  otro: { emoji: "🗂️", label: "Sin categorizar" },
};

export function presentCategory(categoria: string) {
  return isCategory(categoria)
    ? CATEGORY_PRESENTATION[categoria]
    : CATEGORY_PRESENTATION.otro;
}

/** Categorías "accionables": las únicas que pueden estar pendientes/hechas. */
export const ACTIONABLE_CATEGORIES = ["tarea", "recordatorio"] as const;
