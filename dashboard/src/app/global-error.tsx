"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Último recurso: sólo se activa si falla el propio layout raíz (algo muy
 * gordo). Reemplaza todo el documento, así que debe traer su <html>/<body>
 * y su propio CSS. Deliberadamente sin dependencias de componentes, para
 * que funcione aunque lo que haya fallado sea justo el árbol de UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error fatal en el layout raíz:", error);
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-paper-line bg-paper-raised p-8 text-center shadow-sm">
          <h1 className="font-display text-xl font-semibold">Algo ha ido mal</h1>
          <p className="text-sm text-muted">
            Ha ocurrido un error inesperado. Vuelve a intentarlo en un momento.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
