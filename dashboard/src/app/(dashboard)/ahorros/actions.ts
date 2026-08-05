"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type { MovimientoAhorro } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getMovimientos } from "@/lib/ahorros";

export interface AhorrosResult {
  error?: string;
}

/** Crea una cuenta/bucket de ahorro nueva. */
export async function createCuenta(nombre: string, objetivoCentimos: number | null): Promise<AhorrosResult> {
  const userId = await verifySession();
  const trimmed = nombre.trim();
  if (!trimmed) return { error: "Escribe un nombre para la cuenta." };

  try {
    await prisma.cuentaAhorro.create({
      data: { userId, nombre: trimmed, objetivoCentimos: objetivoCentimos ?? null },
    });
    revalidatePath("/ahorros");
    return {};
  } catch (err) {
    console.error("Error al crear la cuenta de ahorro:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido crear la cuenta. Inténtalo de nuevo." };
  }
}

/** Borra una cuenta y (en cascada, ver schema.prisma) todo su historial de movimientos. */
export async function deleteCuenta(id: string): Promise<AhorrosResult> {
  const userId = await verifySession();
  try {
    await prisma.cuentaAhorro.deleteMany({ where: { id, userId } });
    revalidatePath("/ahorros");
    return {};
  } catch (err) {
    console.error("Error al borrar la cuenta de ahorro:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar. Inténtalo de nuevo." };
  }
}

/**
 * Registra un ingreso (céntimos positivos) o retirada (negativos).
 * `MovimientoAhorro` no lleva `userId` propio — el dueño se comprueba vía
 * la cuenta antes de insertar nada.
 */
export async function addMovimiento(
  cuentaId: string,
  centimos: number,
  concepto: string | null,
): Promise<AhorrosResult> {
  const userId = await verifySession();
  if (!Number.isFinite(centimos) || centimos === 0) return { error: "La cantidad no puede ser cero." };

  try {
    const cuenta = await prisma.cuentaAhorro.findFirst({ where: { id: cuentaId, userId } });
    if (!cuenta) return { error: "No se ha encontrado la cuenta." };

    await prisma.movimientoAhorro.create({
      data: { cuentaId, centimos, concepto: concepto?.trim() || null },
    });
    revalidatePath("/ahorros");
    return {};
  } catch (err) {
    console.error("Error al registrar el movimiento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}

/** Lee el historial de una cuenta bajo demanda (el modal de detalle no lo trae hasta que se abre). */
export async function listMovimientos(cuentaId: string): Promise<MovimientoAhorro[]> {
  const userId = await verifySession();
  return getMovimientos(cuentaId, userId);
}
