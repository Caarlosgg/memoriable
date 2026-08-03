"use client";

import { unstable_catchError, type ErrorInfo } from "next/error";

/**
 * Límite de error por sección (no por ruta): un fallo puntual en una
 * sección (p. ej. la BD cae al cargar Pendientes) no debe tumbar el resto
 * del dashboard. `unstable_catchError` es la utilidad de Next.js pensada
 * para esto — a diferencia de `error.tsx` (que solo cubre segmentos de
 * ruta enteros), envuelve cualquier parte del árbol y su `unstable_retry()`
 * vuelve a pedir los datos al servidor, no solo a limpiar el estado local.
 */
function SectionErrorFallback(
  props: { title: string },
  { error, unstable_retry }: ErrorInfo,
) {
  return (
    <div
      role="alert"
      className="fade-in rounded-xl border border-danger/30 bg-danger-soft p-4"
    >
      <p className="text-sm font-medium text-danger">
        {props.title}: no se ha podido cargar.
      </p>
      <p className="mt-1 text-xs text-danger/80">{error.message}</p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-3 rounded-full bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
      >
        Reintentar
      </button>
    </div>
  );
}

export const SectionErrorBoundary = unstable_catchError(SectionErrorFallback);
