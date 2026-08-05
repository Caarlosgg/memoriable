"use client";

import { Search } from "lucide-react";

/** Botón-icono para abrir la paleta de comandos sin teclado (móvil). */
export function CommandPaletteButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
      aria-label="Buscar, navegar o crear"
      className="rounded-full p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Search aria-hidden size={18} />
    </button>
  );
}
