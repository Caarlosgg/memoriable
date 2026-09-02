"use client";

import { useEffect, useState } from "react";

/**
 * Registra el service worker del shell y avisa si hay una versión nueva.
 * Solo en producción: en `next dev` interferiría con el hot-reload de
 * Turbopack.
 *
 * `controllerchange` se dispara cada vez que el SW que controla la página
 * cambia — INCLUIDA la primera vez que un SW toma el control (nadie lo
 * controlaba antes). Sin distinguir ese caso, alguien visitando por primera
 * vez vería "hay una versión nueva" sin haber tenido nunca una vieja. Se
 * guarda si YA había un controlador ANTES de que algo cambie: solo con eso
 * es un aviso real de actualización, no del primer arranque.
 */
export function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

    function handleControllerChange() {
      if (hadControllerAtLoad) setUpdateAvailable(true);
    }
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("No se pudo registrar el service worker:", err);
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div role="status" aria-live="polite" className="fade-in border-b border-accent-soft bg-accent-soft px-4 py-2">
      <p className="mx-auto flex max-w-3xl items-center justify-center gap-3 text-center text-sm font-medium text-accent-strong">
        Hay una versión nueva de MemorIAble.
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Recargar
        </button>
      </p>
    </div>
  );
}
