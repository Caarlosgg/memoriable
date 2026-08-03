"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

/** No hay `navigator` en el servidor: se asume online hasta que el cliente lo confirme. */
function getServerSnapshot() {
  return true;
}

/**
 * Aviso no intrusivo de "sin conexión": una barra fina, no un modal.
 * Solo informa (los datos siempre se piden en fresco; no hay
 * sincronización offline). El contenedor con aria-live se mantiene
 * siempre montado —solo cambia su contenido— porque así es como los
 * lectores de pantalla detectan el cambio de forma fiable.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div role="status" aria-live="polite">
      {!isOnline && (
        <p className="fade-in border-b border-highlight-soft bg-highlight-soft px-4 py-2 text-center text-sm font-medium text-highlight-strong">
          Sin conexión. Lo que ves puede no estar actualizado.
        </p>
      )}
    </div>
  );
}
