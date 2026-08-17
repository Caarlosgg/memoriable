"use client";

import { useEffect } from "react";

/**
 * Lleva el elemento con este `id` a la vista al montar, si `enabled`. El
 * scroll nativo por ancla (`#mensaje-ID`) llega demasiado pronto cuando el
 * contenido está detrás de un `Suspense` — el navegador intenta el scroll
 * justo tras la navegación, mientras todavía se ve el esqueleto, y no
 * encuentra el elemento. Al hacerlo aquí, en el propio montaje del elemento
 * ya renderizado, siempre lo encuentra.
 */
export function useScrollIntoViewOnMount(id: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Solo al montar: no se quiere volver a hacer scroll si `enabled` sigue
    // siendo true en un re-render posterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
