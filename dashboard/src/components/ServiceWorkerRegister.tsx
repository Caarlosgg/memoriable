"use client";

import { useEffect } from "react";

/**
 * Registra el service worker del shell. Solo en producción: en `next dev`
 * interferiría con el hot-reload de Turbopack.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("No se pudo registrar el service worker:", err);
    });
  }, []);

  return null;
}
