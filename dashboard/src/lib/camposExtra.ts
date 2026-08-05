/**
 * Campos extra personalizados (Fase E): `Message.camposExtra` es un JSON
 * libre `{nombre: {tipo, valor}}` — este módulo es el único sitio que sabe
 * convertir entre esa forma "de almacenamiento" y el array editable que
 * usa `MessageDetailDialog` (más cómodo para un formulario con filas).
 */

export type CampoExtraTipo = "texto" | "numero" | "fecha";

export interface CampoExtra {
  nombre: string;
  tipo: CampoExtraTipo;
  valor: string;
}

/** Forma tal cual se guarda en `Message.camposExtra` (JSON de Prisma). */
export type CamposExtraJson = Record<string, { tipo: CampoExtraTipo; valor: string }>;

function isCampoExtraTipo(value: unknown): value is CampoExtraTipo {
  return value === "texto" || value === "numero" || value === "fecha";
}

/** Lee el JSON guardado (de forma defensiva: puede venir vacío, nulo o con forma inesperada). */
export function camposExtraToArray(json: unknown): CampoExtra[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  return Object.entries(json as Record<string, unknown>).map(([nombre, raw]) => {
    const entry = raw && typeof raw === "object" ? (raw as { tipo?: unknown; valor?: unknown }) : {};
    return {
      nombre,
      tipo: isCampoExtraTipo(entry.tipo) ? entry.tipo : "texto",
      valor: typeof entry.valor === "string" ? entry.valor : "",
    };
  });
}

/** Compone el array editable de vuelta al JSON que se guarda — descarta filas sin nombre. */
export function camposExtraToJson(rows: CampoExtra[]): CamposExtraJson {
  const json: CamposExtraJson = {};
  for (const row of rows) {
    const nombre = row.nombre.trim();
    if (!nombre) continue;
    json[nombre] = { tipo: row.tipo, valor: row.valor };
  }
  return json;
}
