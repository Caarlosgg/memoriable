import type { StoredMessage } from './repository.js';

/**
 * Categorías que representan algo accionable, es decir, que se puede tener
 * "pendiente" o "hecho". El resto (idea, nota, pregunta, otro) no aparecen en
 * /pendientes: no son tareas que cerrar.
 */
export const ACTIONABLE_CATEGORIES = ['tarea', 'recordatorio'] as const;

/** Límite por defecto de pendientes devueltos. */
export const DEFAULT_PENDING_LIMIT = 20;

/**
 * ¿Es un pendiente? Un mensaje accionable (tarea/recordatorio) que aún no se ha
 * marcado como hecho. Lógica pura, sin I/O, para poder testearla sin base de
 * datos y compartirla con la implementación en memoria.
 */
export function isPending(message: { categoria: string; hecho: boolean }): boolean {
  return !message.hecho && (ACTIONABLE_CATEGORIES as readonly string[]).includes(message.categoria);
}

/**
 * Filtra los pendientes y los ordena por fecha, más recientes primero. Es el
 * equivalente en memoria del `WHERE hecho = false AND categoria IN (...)` que
 * usa Postgres, extraído aquí para testear el comportamiento esperado.
 */
export function pendingMessages(
  messages: readonly StoredMessage[],
  limit: number = DEFAULT_PENDING_LIMIT,
): StoredMessage[] {
  return messages
    .filter(isPending)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .slice(0, Math.max(0, limit));
}
