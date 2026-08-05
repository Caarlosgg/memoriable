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
