"use client";

import { useSyncExternalStore } from "react";

/** No cambia nunca durante la sesión: no hay a qué suscribirse. */
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  // `userAgent` y no `platform`: este último está deprecado y ya devuelve
  // valores congelados en varios navegadores.
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** En el servidor se asume que no: Ctrl es el caso mayoritario y el fallback correcto. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Si el usuario está en un Mac, para escribir ⌘ en vez de Ctrl en los
 * atajos que se enseñan por pantalla.
 *
 * `useSyncExternalStore` y no `useEffect`: es un dato del entorno que solo
 * existe en el cliente, y así el HTML del servidor y el primer render del
 * cliente coinciden por diseño en vez de provocar un aviso de hidratación.
 */
export function useEsMac(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
