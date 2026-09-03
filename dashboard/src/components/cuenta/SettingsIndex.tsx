"use client";

import type { LucideIcon } from "lucide-react";

export interface SettingsEntry {
  /** Debe coincidir con el `id` del `<Grupo>` correspondiente (ver CuentaSection). */
  id: string;
  titulo: string;
  /** Qué hay dentro. Es LA razón de que exista este índice — ver abajo. */
  contiene: string;
  Icon: LucideIcon;
}

/**
 * Índice de los ajustes: qué secciones hay y qué contiene cada una.
 *
 * El problema no era la navegación, era saber que las cosas EXISTEN. Los
 * grupos venían plegados y solo uno abierto, así que el tema, los avisos
 * push, las categorías propias y la exportación estaban invisibles salvo
 * que se te ocurriera abrir el grupo correcto — y nadie abre a ciegas un
 * desplegable llamado "Apariencia y contenido" para descubrir que ahí se
 * cambia el tema.
 *
 * Por eso cada entrada dice lo que lleva dentro, no solo su título: leer
 * "Tema, categorías ocultas, categorías propias" resuelve la pregunta sin
 * abrir nada.
 *
 * Abre el grupo además de saltar a él. Un ancla a secas dejaría al usuario
 * mirando un desplegable cerrado, que es exactamente donde estaba.
 */
export function SettingsIndex({ entries }: { entries: SettingsEntry[] }) {
  function abrir(id: string) {
    const grupo = document.getElementById(`cuenta-grupo-${id}`);
    if (!(grupo instanceof HTMLDetailsElement)) return;
    grupo.open = true;
    grupo.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav aria-label="Secciones de ajustes" className="flex flex-col gap-2">
      <ul className="grid gap-2 sm:grid-cols-2">
        {entries.map(({ id, titulo, contiene, Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => abrir(id)}
              className="flex w-full items-start gap-2.5 rounded-xl border border-paper-line bg-paper-raised p-3 text-left transition-colors hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <Icon aria-hidden size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{titulo}</span>
                <span className="block truncate text-xs text-muted">{contiene}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
