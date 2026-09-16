export interface FrontmatterParseResult {
  frontmatter: Record<string, string>;
  cuerpo: string;
}

/**
 * Front matter YAML minimalista: solo pares `clave: valor` de una línea, sin
 * anidar ni listas de bloque (`- uno` en líneas aparte) — cubre lo que
 * escribe de verdad Obsidian o cualquier apunte manual. `js-yaml` está en el
 * proyecto solo como `overrides` (fuerza la versión de una dependencia
 * transitiva de eslint), no como dependencia real utilizable aquí; para lo
 * que hace falta (título/etiquetas/fecha sueltos) basta este parser de mano
 * en vez de sumar una dependencia nueva.
 */
export function parseFrontmatter(texto: string): FrontmatterParseResult {
  const match = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, cuerpo: texto };
  const [, bloque, cuerpo] = match;
  const frontmatter: Record<string, string> = {};
  for (const linea of bloque!.split(/\r?\n/)) {
    const m = linea.match(/^([\w-]+):\s*(.*)$/);
    if (m) frontmatter[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter, cuerpo: cuerpo! };
}

/** `tags: uno, dos` o `tags: [uno, dos]` — no listas de bloque YAML. Vacío si no hay campo o no queda nada tras limpiar. */
export function parseEtiquetasFrontmatter(valor: string | undefined): string[] {
  if (!valor) return [];
  const sinCorchetes = valor.trim().replace(/^\[|\]$/g, "");
  return sinCorchetes
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Fecha del frontmatter (`date: 2024-03-15` o ISO completo) — `undefined` si falta o no es una fecha válida, nunca lanza. */
export function parseFechaFrontmatter(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}
