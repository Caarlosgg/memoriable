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
      className="fade-in rounded-xl border border-red-200 bg-red-50 p-4"
    >
      <p className="text-sm font-medium text-red-800">
        {props.title}: no se ha podido cargar.
      </p>
      <p className="mt-1 text-xs text-red-600">{error.message}</p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-3 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 transition-colors hover:bg-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        Reintentar
      </button>
    </div>
  );
}

export const SectionErrorBoundary = unstable_catchError(SectionErrorFallback);
