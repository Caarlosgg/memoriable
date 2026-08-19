import type { EstadoTarea } from "@prisma/client";
import { ESTADOS_TABLERO, ESTADO_PRESENTATION } from "./kanban";

/**
 * Una columna del tablero, venga de las tres de siempre o de una propia del
 * workspace (ver `BoardStatus` en el schema). El resto de la interfaz
 * trabaja SOLO con esto y no necesita saber de cuál de las dos viene.
 *
 * `id` es lo que viaja en el arrastre y en las acciones: para una columna
 * por defecto es el propio valor del enum ("POR_HACER"), para una propia es
 * su cuid. Así el tablero de un workspace que nunca ha tocado sus columnas
 * se comporta exactamente igual que antes de que esto existiera.
 */
export interface ColumnaTablero {
  id: string;
  nombre: string;
  /** Fase del ciclo: lo que se guarda en `Message.estado` al soltar aquí. */
  fase: EstadoTarea;
  /** Las por defecto no se pueden borrar ni cambiar de fase (solo renombrar, como siempre). */
  esPersonalizada: boolean;
}

/** Fila de `BoardStatus` tal como llega de Prisma — solo lo que hace falta aquí. */
export interface BoardStatusRow {
  id: string;
  nombre: string;
  orden: number;
  fase: EstadoTarea;
}

/**
 * Las columnas efectivas de un workspace: las suyas propias si tiene, o las
 * tres de siempre si no. Pura, para poder probar la regla sin base de datos.
 *
 * `boardLabels` (el renombrado que ya existía) sigue aplicando a las
 * columnas por defecto — quien solo quería llamar "Pedidos" a "Por hacer"
 * no tiene que crear columnas propias para eso.
 */
export function resolverColumnas(
  statuses: BoardStatusRow[],
  boardLabels: Partial<Record<EstadoTarea, string>> = {},
): ColumnaTablero[] {
  if (statuses.length > 0) {
    return [...statuses]
      .sort((a, b) => a.orden - b.orden)
      .map((s) => ({
        id: s.id,
        nombre: s.nombre,
        fase: s.fase,
        esPersonalizada: true,
      }));
  }
  return ESTADOS_TABLERO.map((estado) => ({
    id: estado,
    nombre: boardLabels[estado] || ESTADO_PRESENTATION[estado].label,
    fase: estado,
    esPersonalizada: false,
  }));
}

/**
 * En qué columna cae una tarjeta. `boardStatusId` manda; si está vacío (o
 * apunta a una columna ya borrada, que es lo que deja el ON DELETE SET
 * NULL), cae en la primera columna de su fase — nunca desaparece del
 * tablero por no tener columna.
 */
export function columnaDeTarjeta(
  message: { estado: EstadoTarea; boardStatusId: string | null },
  columnas: ColumnaTablero[],
): string {
  if (
    message.boardStatusId &&
    columnas.some((c) => c.id === message.boardStatusId)
  ) {
    return message.boardStatusId;
  }
  const primeraDeSuFase = columnas.find((c) => c.fase === message.estado);
  // Si un workspace se quedara sin ninguna columna de esa fase (p. ej.
  // borró todas las de "en progreso"), la tarjeta va a la primera columna
  // que haya: preferible a que no se vea en ninguna parte.
  return primeraDeSuFase?.id ?? columnas[0]?.id ?? message.estado;
}

/** Fase que corresponde a una columna — lo que se guarda en `Message.estado` al soltar ahí. */
export function faseDeColumna(
  columnaId: string,
  columnas: ColumnaTablero[],
): EstadoTarea | null {
  return columnas.find((c) => c.id === columnaId)?.fase ?? null;
}

export const MAX_COLUMNAS = 8;
export const MAX_NOMBRE_COLUMNA = 30;

/**
 * Prefijo del id con el que una COLUMNA se registra como arrastrable.
 *
 * Hace falta porque el id de la columna a secas ya está ocupado: es el que
 * usa su `useDroppable` para recibir tarjetas. Registrar el mismo id como
 * arrastrable y como destino confundiría a dnd-kit. Y como efecto útil, es
 * lo que deja al tablero saber si lo que viaja en el arrastre es una
 * tarjeta o una columna sin tener que consultar ninguna lista.
 */
export const COLUMN_DRAG_PREFIX = "col:";

/** El id de columna que hay detrás de un id de arrastre, o null si eso no es una columna. */
export function columnaDeDragId(dragId: string): string | null {
  return dragId.startsWith(COLUMN_DRAG_PREFIX)
    ? dragId.slice(COLUMN_DRAG_PREFIX.length)
    : null;
}
