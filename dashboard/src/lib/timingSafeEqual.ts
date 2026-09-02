import { timingSafeEqual } from "node:crypto";

/**
 * Compara dos cadenas sin filtrar su longitud/contenido por tiempo de
 * respuesta (defensa en profundidad para el `state` del CSRF de OAuth) —
 * `timingSafeEqual` exige buffers del mismo tamaño, así que el chequeo de
 * longitud va antes, no dentro de un try/catch.
 */
export function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
