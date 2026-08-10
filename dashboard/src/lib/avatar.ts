/**
 * Iniciales e identidad visual a partir de un email — `User` no tiene
 * `nombre` (ver schema.prisma), solo `email`, así que toda "identidad
 * visible" de una persona en modo equipo se deriva de ahí. "ana.garcia@..."
 * → "AG"; "ana@..." (sin separador) → primeras dos letras del local-part.
 */
export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : local.slice(0, 2);
  return letters.toUpperCase() || "?";
}

/**
 * Color determinista por email (mismo email → mismo color siempre, sin
 * guardar nada): útil para distinguir a simple vista quién es quién en un
 * tablero/calendario compartido. Reutiliza la propia paleta de categorías
 * (`--cat-*`, ya con variante clara/oscura) en vez de introducir un juego
 * de colores nuevo — mismo aspecto visual, y ya theme-aware sin CSS extra.
 * Un avatar y una categoría pueden coincidir en color en la misma tarjeta;
 * no se confunden porque tienen forma distinta (círculo con iniciales vs.
 * icono + etiqueta).
 */
const AVATAR_HUES = [
  "text-cat-tarea bg-cat-tarea-soft",
  "text-cat-idea bg-cat-idea-soft",
  "text-cat-pregunta bg-cat-pregunta-soft",
  "text-cat-recordatorio bg-cat-recordatorio-soft",
  "text-cat-nota bg-cat-nota-soft",
  "text-cat-otro bg-cat-otro-soft",
] as const;

export function avatarColorClass(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length]!;
}
