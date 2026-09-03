"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Nunca refrescar dos veces en menos de esto, pase lo que pase. */
const MIN_GAP_MS = 5000;

/**
 * Vuelve a pedir los datos del servidor sin que el usuario tenga que
 * recargar.
 *
 * El problema que resuelve es el peor momento posible para tenerlo: mandas
 * tu primer mensaje al bot desde el móvil, miras la pestaña que tenías
 * abierta en el ordenador y **no hay nada**. El "aha" del producto, roto
 * por una caché. Y como el mensaje llega por Telegram, ninguna Server
 * Action de esta pestaña puede revalidar nada — no hay nada que revalidar
 * desde aquí.
 *
 * Dos disparadores, cada uno para un caso real distinto:
 *
 * - **Volver a la pestaña** (`visibilitychange`): capturaste desde otra app
 *   y vuelves. Es el caso normal y no cuesta nada.
 * - **Sondeo** (`intervalMs`, opcional): estás MIRANDO la pantalla mientras
 *   escribes desde el móvil, así que nunca hay cambio de foco. Solo se
 *   activa donde de verdad hace falta —la primera captura— y se apaga si la
 *   pestaña está oculta, para no despertar al servidor cada pocos segundos
 *   en una pestaña olvidada.
 */
export function AutoRefresh({ intervalMs }: { intervalMs?: number }) {
  const router = useRouter();
  const ultimoRef = useRef(0);

  useEffect(() => {
    function refrescar() {
      const ahora = Date.now();
      if (ahora - ultimoRef.current < MIN_GAP_MS) return;
      ultimoRef.current = ahora;
      router.refresh();
    }

    function alVolver() {
      if (document.visibilityState === "visible") refrescar();
    }

    document.addEventListener("visibilitychange", alVolver);

    const timer = intervalMs
      ? setInterval(() => {
          if (document.visibilityState === "visible") refrescar();
        }, intervalMs)
      : null;

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      if (timer) clearInterval(timer);
    };
  }, [router, intervalMs]);

  return null;
}
