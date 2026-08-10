/**
 * Checklist/subtareas dentro de una tarea (organización): `Message.checklist`
 * es un JSON array `[{id, texto, hecho}]` — este módulo es el único sitio
 * que sabe convertir entre esa forma "de almacenamiento" y el array
 * editable que usa `MessageDetailDialog`. Mismo criterio que camposExtra.ts,
 * campo aparte a propósito (ver el comentario en schema.prisma).
 */

export interface ChecklistItem {
  id: string;
  texto: string;
  hecho: boolean;
  // Índice permisivo (mismo truco que el Record de camposExtra.ts): sin
  // esto, TypeScript no deja pasar `ChecklistItem[]` como `Prisma.Json`
  // (el tipo JSON de Prisma exige que los objetos tengan índice de string).
  [key: string]: string | boolean;
}

/** Lee el JSON guardado (de forma defensiva: puede venir vacío, nulo o con forma inesperada). */
export function checklistToArray(json: unknown): ChecklistItem[] {
  if (!Array.isArray(json)) return [];
  return json.map((raw) => {
    const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
      texto: typeof entry.texto === "string" ? entry.texto : "",
      hecho: entry.hecho === true,
    };
  });
}

/** Compone el array editable de vuelta al JSON que se guarda — descarta filas sin texto. */
export function checklistToJson(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .map((item) => ({ ...item, texto: item.texto.trim() }))
    .filter((item) => item.texto !== "");
}

/** `{hechos}/{total}` — para el indicador rápido en la tarjeta del tablero. */
export function checklistProgress(items: ChecklistItem[]): { hechos: number; total: number } {
  return { hechos: items.filter((i) => i.hecho).length, total: items.length };
}
