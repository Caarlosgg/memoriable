"use client";

import type { Message } from "@prisma/client";

/**
 * `KanbanBoard` y `CurrentTaskBar` viven en partes distintas del árbol
 * (tablero vs layout) y no comparten estado — sin esto, cuando TÚ mismo
 * empiezas/sueltas/completas una tarjeta, tu propia barra de "en curso
 * ahora" no se enteraría hasta el siguiente sondeo (hasta 20s después),
 * aunque el cambio lo acabas de hacer tú en la misma pestaña. Un evento de
 * `window` es más simple que subir estado compartido al layout entero.
 */
export const EN_PROGRESO_CHANGED_EVENT = "en-progreso-changed";

export function notifyEnProgresoChanged(): void {
  window.dispatchEvent(new Event(EN_PROGRESO_CHANGED_EVENT));
}

/**
 * Dirección contraria a la de arriba: `CurrentTaskBar` (fuera de
 * `KanbanBoard`, vive en el layout) puede marcar hecha o soltar tu tarea
 * activa — sin esto, el tablero ya montado se quedaría enseñando la
 * tarjeta como "Trabajando…" hasta que alguien navegara o refrescara
 * (mismo motivo que el resto del tablero usa actualización optimista en
 * vez de fiarse solo de `revalidatePath`, que no toca un Client Component
 * ya montado).
 */
export const TASK_PATCHED_ELSEWHERE_EVENT = "task-patched-elsewhere";

export interface TaskPatchedElsewhereDetail {
  messageId: string;
  patch: Partial<Message>;
}

export function notifyTaskPatchedElsewhere(detail: TaskPatchedElsewhereDetail): void {
  window.dispatchEvent(new CustomEvent<TaskPatchedElsewhereDetail>(TASK_PATCHED_ELSEWHERE_EVENT, { detail }));
}
