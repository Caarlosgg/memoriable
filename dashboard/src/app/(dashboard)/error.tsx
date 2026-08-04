"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Límite de error a nivel de ruta del dashboard: red de seguridad para
 * cualquier fallo que no atrape ya un SectionErrorBoundary (p. ej. la carga
 * de la página de Cuenta si Supabase está caído). Sin esto, un throw en un
 * Server Component acaba en la pantalla de error genérica de Next (o en
 * blanco en producción, con el mensaje censurado).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error en una ruta del dashboard:", error);
  }, [error]);

  return (
    <div className="fade-in mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-paper-line bg-paper-raised p-8 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert aria-hidden size={22} />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-ink">Algo ha fallado</h2>
        <p className="text-sm text-muted">
          No hemos podido cargar esta sección. Suele ser algo puntual — vuelve a intentarlo.
        </p>
      </div>
      <Button type="button" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
