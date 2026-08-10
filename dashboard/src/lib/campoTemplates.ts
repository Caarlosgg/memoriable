import type { CampoExtraTipo } from "./camposExtra";

/**
 * Plantilla reutilizable de campos por categoría (ver `CampoTemplate` en
 * schema.prisma): mismo shape que un `CampoExtra` pero SIN `valor` — es la
 * definición, no un dato concreto de una nota. Este módulo es el
 * equivalente de camposExtra.ts para convertir entre la forma "de
 * almacenamiento" (JSON de Prisma) y el array editable.
 */
export interface CampoTemplateField {
  nombre: string;
  tipo: CampoExtraTipo;
}

/** Forma tal cual se guarda en `CampoTemplate.campos` (JSON de Prisma). */
export type CampoTemplateJson = Record<string, { tipo: CampoExtraTipo }>;

function isCampoExtraTipo(value: unknown): value is CampoExtraTipo {
  return value === "texto" || value === "numero" || value === "fecha";
}

/** Lee el JSON guardado (defensivo: puede venir vacío, nulo o con forma inesperada). */
export function campoTemplateToArray(json: unknown): CampoTemplateField[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  return Object.entries(json as Record<string, unknown>).map(([nombre, raw]) => {
    const entry = raw && typeof raw === "object" ? (raw as { tipo?: unknown }) : {};
    return { nombre, tipo: isCampoExtraTipo(entry.tipo) ? entry.tipo : "texto" };
  });
}

/** Compone el array editable de vuelta al JSON que se guarda — descarta filas sin nombre. */
export function campoTemplateToJson(rows: CampoTemplateField[]): CampoTemplateJson {
  const json: CampoTemplateJson = {};
  for (const row of rows) {
    const nombre = row.nombre.trim();
    if (!nombre) continue;
    json[nombre] = { tipo: row.tipo };
  }
  return json;
}
