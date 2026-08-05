/**
 * Dinero SIEMPRE en céntimos (entero) — Float/Decimal para dinero es la
 * fuente número uno de errores de redondeo tontos; un entero no los tiene.
 * Este módulo es el único sitio que convierte entre "céntimos" (lo que se
 * guarda) y "euros con coma" (lo que escribe/lee una persona).
 */

const EUR_FORMATTER = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatCentimos(centimos: number): string {
  return EUR_FORMATTER.format(centimos / 100);
}

/**
 * Convierte lo que escribe alguien ("12,50", "12.50", "12") a céntimos
 * enteros. `null` si no es un número interpretable — nunca lanza, para que
 * el que llama decida el mensaje de error.
 */
export function parseEurosToCentimos(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "" || Number.isNaN(Number(normalized))) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
