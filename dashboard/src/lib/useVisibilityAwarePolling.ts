"use client";

import { useEffect, useRef } from "react";

/**
 * Sondeo corto que solo corre mientras la pestaña está visible — extraído
 * de `CurrentTaskBar.tsx` (donde nació) para reutilizarlo tal cual en
 * `ConversationThread.tsx`. Una pestaña de fondo (o varias abiertas a la vez, cada
 * una con su propio temporizador) no tiene por qué seguir generando
 * tráfico contra el pool de conexiones de Postgres cada pocos segundos si
 * nadie la está mirando. Al volver a primer plano, refresca al instante y
 * reanuda el sondeo.
 *
 * `callback` se envuelve en un ref interno: así el intervalo no se
 * reinicia en cada render por una identidad de función nueva — solo
 * `intervalMs` (y montar/desmontar) controlan el ciclo de vida real.
 */
export function useVisibilityAwarePolling(callback: () => void, intervalMs: number): void {
  const callbackRef = useRef(callback);
  // Fuera de un `useEffect`, escribir en un ref durante el render está
  // prohibido (aunque no dispare un re-render) — se actualiza aquí, después
  // de cada render, en vez de en el cuerpo de la función.
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    callbackRef.current();

    let id: ReturnType<typeof setInterval> | undefined;
    // `visibilitychange` (volver a esta pestaña) y `focus` (la ventana
    // recupera el foco del SO) no son el mismo evento — con dos ventanas
    // una junto a otra, solo `focus` avisa al cambiar entre ellas sin que
    // la pestaña llegue a ocultarse. Pero al volver de una pestaña en
    // segundo plano (el caso más común) los dos SUELEN dispararse casi a
    // la vez, duplicando la consulta — este margen mínimo evita el doble
    // refresco sin perder ninguno de los dos casos reales.
    let lastRefreshAt = 0;
    const DEDUPE_MS = 1000;
    function dedupedRefresh() {
      const now = Date.now();
      if (now - lastRefreshAt < DEDUPE_MS) return;
      lastRefreshAt = now;
      callbackRef.current();
    }
    function startPolling() {
      if (id !== undefined) return;
      id = setInterval(() => callbackRef.current(), intervalMs);
    }
    function stopPolling() {
      if (id === undefined) return;
      clearInterval(id);
      id = undefined;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        dedupedRefresh();
        startPolling();
      } else {
        stopPolling();
      }
    }
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", dedupedRefresh);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", dedupedRefresh);
    };
  }, [intervalMs]);
}
