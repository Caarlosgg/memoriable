"use client";

import { useState, useTransition } from "react";
import { EyeOff } from "lucide-react";
import { CATEGORIES, CATEGORY_PRESENTATION, type Category } from "@/lib/categories";
import { setHiddenCategories } from "@/app/(dashboard)/equipo/actions";

/** Solo tiene sentido en modo equipo (Notas/Tablero comparten categorías fijas) — igual visible en personal, no hace daño ocultarlas ahí también si alguien quiere. */
export function HiddenCategoriesForm({ initialHidden }: { initialHidden: string[] }) {
  const [hidden, setHidden] = useState(new Set(initialHidden));
  const [pending, startTransition] = useTransition();

  function toggle(categoria: Category) {
    const next = new Set(hidden);
    if (next.has(categoria)) next.delete(categoria);
    else next.add(categoria);
    setHidden(next);
    startTransition(() => {
      void setHiddenCategories([...next]);
    });
  }

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 flex items-center gap-1.5 font-display text-lg text-ink">
        <EyeOff aria-hidden size={17} /> Categorías ocultas
      </p>
      <p className="mb-3 text-sm text-muted">
        Las que desmarques desaparecen de Notas y del Tablero para ti — solo para ti, no afecta a nadie más del
        equipo.
      </p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((categoria) => {
          const { label, Icon } = CATEGORY_PRESENTATION[categoria];
          const visible = !hidden.has(categoria);
          return (
            <button
              key={categoria}
              type="button"
              aria-pressed={visible}
              disabled={pending}
              onClick={() => toggle(categoria)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 ${
                visible ? "border-accent bg-accent-soft text-accent-strong" : "border-paper-line text-muted"
              }`}
            >
              <Icon aria-hidden size={14} /> {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
