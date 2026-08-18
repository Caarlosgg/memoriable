/**
 * Normaliza texto para comparar por voz: minúsculas + sin tildes/diacríticos.
 * Sin esto, "Reunión" (guardado con tilde) y "reunion" (como lo dice o lo
 * transcribe el usuario, o como lo normaliza el propio modelo) no
 * coinciden con un `includes` normal. Extraído a su propio módulo (antes
 * vivía dentro de assistantTools.ts) para que assistantMemory.ts pueda
 * usarlo también sin crear un import circular entre los dos.
 */
export function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

/**
 * Resuelve un nombre o email libre ("benitoelrey", "Benito", su email
 * completo) contra una lista de personas — comparando contra la parte local
 * del email (antes de la @), que es lo que la gente suele usar como
 * "nombre" al hablar con el Asistente.
 *
 * Tres niveles de precisión, EN ORDEN: email completo, luego parte local
 * exacta, y solo si ninguna de las dos encaja, una coincidencia parcial.
 * El orden importa: con un único `.find()` que aceptara cualquiera de las
 * tres condiciones, una coincidencia solo parcial pero antes en la lista
 * (p. ej. "ana.garcia@..." antes que "ana@...") ganaría a la exacta,
 * eligiendo en silencio a la persona equivocada.
 *
 * Null si nadie encaja: nunca devuelve "lo que más se parezca" sin overlap
 * real — mejor que el Asistente diga que no encuentra a esa persona.
 */
export function matchPersonaPorEmail<T extends { email: string }>(nombre: string, candidatos: T[]): T | null {
  const normalizado = normalizeForMatch(nombre);
  if (!normalizado) return null;
  return (
    candidatos.find((c) => normalizeForMatch(c.email) === normalizado) ??
    candidatos.find((c) => normalizeForMatch(c.email.split("@")[0] ?? "") === normalizado) ??
    candidatos.find((c) => {
      const local = normalizeForMatch(c.email.split("@")[0] ?? "");
      return local.includes(normalizado) || normalizado.includes(local);
    }) ??
    null
  );
}
