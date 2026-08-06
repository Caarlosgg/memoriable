import "server-only";
import type { CuentaAhorro, MovimientoAhorro } from "@prisma/client";
import { prisma } from "./prisma";

export interface CuentaConSaldo extends CuentaAhorro {
  saldoCentimos: number;
}

/**
 * El saldo NUNCA se lee de un campo propio: se suma `MovimientoAhorro` al
 * vuelo (ver comentario en schema.prisma) — así nunca puede desincronizarse
 * del historial que lo explica. Una consulta de cuentas + una de sumas
 * agrupadas, no N+1.
 */
export async function getCuentasConSaldo(userId: string): Promise<CuentaConSaldo[]> {
  const [cuentas, sumas] = await Promise.all([
    prisma.cuentaAhorro.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.movimientoAhorro.groupBy({
      by: ["cuentaId"],
      where: { cuenta: { userId } },
      _sum: { centimos: true },
    }),
  ]);

  const saldoPorCuenta = new Map(sumas.map((s) => [s.cuentaId, s._sum.centimos ?? 0]));
  return cuentas.map((c) => ({ ...c, saldoCentimos: saldoPorCuenta.get(c.id) ?? 0 }));
}

/** Historial de una cuenta, más reciente primero. Comprueba dueño vía la relación (MovimientoAhorro no tiene userId propio). */
export async function getMovimientos(cuentaId: string, userId: string): Promise<MovimientoAhorro[]> {
  return prisma.movimientoAhorro.findMany({
    where: { cuentaId, cuenta: { userId } },
    orderBy: { fecha: "desc" },
  });
}

export interface CuentaTrend {
  /** Suma neta de movimientos de este mes (natural, hasta hoy). */
  esteMesCentimos: number;
  /** Suma neta de movimientos del mes natural anterior, completo. */
  mesAnteriorCentimos: number;
}

/**
 * Compara el movimiento neto de cada cuenta este mes contra el mes
 * anterior (Tier 2.8: "aviso simple de tendencia"). Pura la parte de
 * agrupar — un solo `findMany` de los últimos ~2 meses, sin `groupBy` por
 * mes (Prisma no agrupa por fecha truncada sin SQL crudo): se agrega en
 * JS, igual criterio que `lib/insights.ts`.
 *
 * Nota: no es "aprender de correcciones de categoría" (lo que pedía el
 * Tier 2.8 originalmente) — `MovimientoAhorro` no tiene ningún campo de
 * categoría hoy, así que no hay nada que "corregir" todavía. Ver el
 * informe de la sesión para el diseño (sin aplicar) de esa parte.
 */
export async function getTendenciasPorCuenta(
  userId: string,
  now: Date = new Date(),
): Promise<Map<string, CuentaTrend>> {
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const movimientos = await prisma.movimientoAhorro.findMany({
    where: { cuenta: { userId }, fecha: { gte: startOfLastMonth } },
    select: { cuentaId: true, centimos: true, fecha: true },
  });

  const trends = new Map<string, CuentaTrend>();
  for (const m of movimientos) {
    const current = trends.get(m.cuentaId) ?? { esteMesCentimos: 0, mesAnteriorCentimos: 0 };
    if (m.fecha >= startOfThisMonth) current.esteMesCentimos += m.centimos;
    else current.mesAnteriorCentimos += m.centimos;
    trends.set(m.cuentaId, current);
  }
  return trends;
}

/** Diferencia mínima para que merezca la pena avisar — menos de 1€ es ruido, no tendencia. */
const TREND_THRESHOLD_CENTIMOS = 100;

/**
 * Traduce una tendencia a un texto corto, o `null` si no hay suficiente
 * base para compararla (sin movimientos el mes anterior) o la diferencia
 * es demasiado pequeña para ser una señal real. Pura.
 */
export function describeTrend(trend: CuentaTrend): string | null {
  if (trend.mesAnteriorCentimos === 0) return null;
  const delta = trend.esteMesCentimos - trend.mesAnteriorCentimos;
  if (Math.abs(delta) < TREND_THRESHOLD_CENTIMOS) return null;
  return delta > 0 ? "↑ ahorrando más que el mes pasado" : "↓ ahorrando menos que el mes pasado";
}
