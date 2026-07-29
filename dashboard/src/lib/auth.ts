import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara la contraseña introducida con la esperada en tiempo constante
 * (hasheando ambas a un tamaño fijo antes de comparar), para no filtrar por
 * temporización cuánto coincide la contraseña probada.
 */
export function passwordMatches(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
