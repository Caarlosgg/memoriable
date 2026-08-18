"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type { EstadoTarea } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace, canWrite, READONLY_ROLE_MESSAGE, getBoardLabels } from "@/lib/workspace";
import { ESTADOS_TABLERO, ESTADO_PRESENTATION } from "@/lib/kanban";
import { resolverColumnas, MAX_COLUMNAS, MAX_NOMBRE_COLUMNA, type ColumnaTablero } from "@/lib/boardColumns";

export interface ColumnasResult {
  columnas?: ColumnaTablero[];
  error?: string;
}

/** Columnas efectivas del workspace activo — propias si las tiene, las tres de siempre si no. */
export async function listBoardColumns(): Promise<ColumnaTablero[]> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const [statuses, boardLabels] = await Promise.all([
    prisma.boardStatus.findMany({ where: { workspaceId }, orderBy: { orden: "asc" } }),
    getBoardLabels(workspaceId),
  ]);
  return resolverColumnas(statuses, boardLabels);
}

/**
 * Crea una columna propia. La PRIMERA vez que un workspace añade una, se
 * materializan también las tres de siempre como columnas propias — si no,
 * al pasar de "3 por defecto" a "1 propia" el tablero se quedaría con una
 * sola columna y todas las tarjetas amontonadas en ella. Materializar
 * primero conserva exactamente el tablero que el usuario está viendo, y la
 * nueva se añade al final.
 */
export async function createBoardColumn(nombre: string, fase: EstadoTarea): Promise<ColumnasResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  const trimmed = nombre.trim();
  if (!trimmed) return { error: "Ponle un nombre a la columna." };
  if (trimmed.length > MAX_NOMBRE_COLUMNA) {
    return { error: `El nombre no puede tener más de ${MAX_NOMBRE_COLUMNA} caracteres.` };
  }
  if (!(ESTADOS_TABLERO as readonly string[]).includes(fase)) return { error: "Esa fase no existe." };

  try {
    const existentes = await prisma.boardStatus.count({ where: { workspaceId } });
    if (existentes >= MAX_COLUMNAS) {
      return { error: `No puedes tener más de ${MAX_COLUMNAS} columnas — un tablero más ancho deja de leerse de un vistazo.` };
    }

    if (existentes === 0) {
      const boardLabels = await getBoardLabels(workspaceId);
      await prisma.boardStatus.createMany({
        data: ESTADOS_TABLERO.map((estado, i) => ({
          workspaceId,
          nombre: boardLabels[estado] || ESTADO_PRESENTATION[estado].label,
          orden: i,
          fase: estado,
        })),
      });
    }

    const orden = existentes === 0 ? ESTADOS_TABLERO.length : existentes;
    await prisma.boardStatus.create({ data: { workspaceId, nombre: trimmed, orden, fase } });
    revalidatePath("/pendientes");
    return { columnas: await listBoardColumns() };
  } catch (err) {
    console.error("No se pudo crear la columna:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido crear la columna." };
  }
}

/** Renombra una columna propia. Las por defecto se renombran por el camino de siempre (`setBoardLabel`). */
export async function renameBoardColumn(columnId: string, nombre: string): Promise<ColumnasResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  const trimmed = nombre.trim();
  if (!trimmed) return { error: "Ponle un nombre a la columna." };
  if (trimmed.length > MAX_NOMBRE_COLUMNA) {
    return { error: `El nombre no puede tener más de ${MAX_NOMBRE_COLUMNA} caracteres.` };
  }

  try {
    // `updateMany` con workspaceId en el where: el id de una columna ajena
    // no puede tocar nada (mismo criterio que el resto de acciones).
    const { count } = await prisma.boardStatus.updateMany({
      where: { id: columnId, workspaceId },
      data: { nombre: trimmed },
    });
    if (count === 0) return { error: "Esa columna no existe en este tablero." };
    revalidatePath("/pendientes");
    return { columnas: await listBoardColumns() };
  } catch (err) {
    console.error("No se pudo renombrar la columna:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido renombrar." };
  }
}

/**
 * Borra una columna propia. Sus tarjetas NO se pierden: el ON DELETE SET
 * NULL las devuelve a la columna por defecto de su fase (ver la migración
 * 20260818100000_board_statuses). No se deja borrar la última de una fase
 * si eso dejaría al tablero sin sitio donde marcar algo como hecho o
 * empezado.
 */
export async function deleteBoardColumn(columnId: string): Promise<ColumnasResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  try {
    const columna = await prisma.boardStatus.findFirst({ where: { id: columnId, workspaceId } });
    if (!columna) return { error: "Esa columna no existe en este tablero." };

    const enLaMismaFase = await prisma.boardStatus.count({ where: { workspaceId, fase: columna.fase } });
    if (enLaMismaFase <= 1) {
      const etiqueta = ESTADO_PRESENTATION[columna.fase].label.toLowerCase();
      return { error: `Es la única columna de «${etiqueta}» — el tablero necesita al menos una de cada fase.` };
    }

    await prisma.boardStatus.delete({ where: { id: columnId } });
    revalidatePath("/pendientes");
    return { columnas: await listBoardColumns() };
  } catch (err) {
    console.error("No se pudo borrar la columna:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar la columna." };
  }
}

/** Reordena las columnas propias de izquierda a derecha, en el orden recibido. */
export async function reorderBoardColumns(columnIds: string[]): Promise<ColumnasResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  try {
    const propias = await prisma.boardStatus.findMany({ where: { workspaceId }, select: { id: true } });
    const validos = new Set(propias.map((c) => c.id));
    // Solo se acepta una reordenación COMPLETA de sus columnas: aceptar una
    // lista parcial dejaría huecos de orden difíciles de razonar después.
    if (columnIds.length !== propias.length || !columnIds.every((id) => validos.has(id))) {
      return { error: "La lista de columnas no coincide con las de este tablero." };
    }

    await prisma.$transaction(
      columnIds.map((id, orden) => prisma.boardStatus.update({ where: { id }, data: { orden } })),
    );
    revalidatePath("/pendientes");
    return { columnas: await listBoardColumns() };
  } catch (err) {
    console.error("No se pudo reordenar las columnas:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar el orden." };
  }
}
