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
