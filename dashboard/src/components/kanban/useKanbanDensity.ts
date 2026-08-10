"use client";

import { useSyncExternalStore } from "react";

export type KanbanDensity = "normal" | "compacta";

const STORAGE_KEY = "memoriable:kanban-density";
const CHANGE_EVENT = `${STORAGE_KEY}:changed`;

function isDensity(value: string | null): value is KanbanDensity {
  return value === "normal" || value === "compacta";
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}

function getSnapshot(): KanbanDensity {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isDensity(stored) ? stored : "normal";
}

function getServerSnapshot(): KanbanDensity {
  return "normal";
}

/**
 * Preferencia de densidad del tablero (normal/compacta), persistida en
 * localStorage — es una preferencia de vista puramente del navegador, no
 * un dato de negocio, así que no justifica una columna en `User` ni una
 * ida y vuelta al servidor solo para recordarla.
 *
 * `useSyncExternalStore` en vez de `useEffect` + `setState`: mismo patrón
 * que `usePrefersReducedMotion` en Sidebar.tsx — es la forma pensada para
 * leer estado externo del navegador sin el "doble render" que dispara el
 * lint de React sobre setState en efectos. `setDensity` dispara un evento
 * propio (`CHANGE_EVENT`) al guardar, que es lo que hace que
 * `useSyncExternalStore` vuelva a leer `localStorage` y re-renderice —
 * sin ese evento, cambiar la preferencia no se reflejaría hasta el
 * siguiente render por otro motivo.
 */
export function useKanbanDensity(): [KanbanDensity, (next: KanbanDensity) => void] {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setDensity(next: KanbanDensity) {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return [density, setDensity];
}
