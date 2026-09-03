"use client";

import { useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { bulkRecategorize, bulkDelete } from "@/app/(dashboard)/actions";
import { CATEGORIES, presentCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/**
 * Barra de acciones en bloque, visible solo cuando hay algo seleccionado.
 *
 * Recategorizar 20 notas eran ~80 clics: abrir cada una, cambiar, guardar,
 * cerrar. Es el tipo de tarea que nadie hace, así que las categorías mal
 * puestas se quedaban mal puestas y la pantalla perdía valor con el uso.
 *
 * Fija abajo (`sticky bottom-0`): con 40 notas seleccionadas y la lista
 * desplazada, una barra arriba obligaría a subir para actuar sobre lo que
 * se está mirando.
 */
export function BulkBar({
  seleccionados,
  onLimpiar,
  onAplicado,
}: {
  seleccionados: string[];
  onLimpiar: () => void;
  /** Se llama tras un cambio con éxito, para que la lista se recargue. */
  onAplicado: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (seleccionados.length === 0) return null;

  function aplicar(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      onLimpiar();
      onAplicado();
    });
  }

  function borrar() {
    // Confirmación de verdad y no un toast de deshacer: un lote se confirma
    // ANTES, porque sostener 50 borrados en vuelo pendientes de deshacer
    // complica el estado de la pantalla mucho más de lo que aporta.
    if (!confirm(`¿Borrar ${seleccionados.length} nota${seleccionados.length === 1 ? "" : "s"}? No se puede deshacer.`)) {
      return;
    }
    aplicar(() => bulkDelete(seleccionados));
  }

  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-xl border border-accent/40 bg-paper-raised p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">
          {seleccionados.length} seleccionada{seleccionados.length === 1 ? "" : "s"}
        </span>

        <Select
          aria-label="Cambiar la categoría de las notas seleccionadas"
          defaultValue=""
          disabled={pending}
          onChange={(e) => {
            const categoria = e.target.value;
            // Se devuelve el desplegable a su sitio: no representa un
            // estado, es un disparador de acción.
            e.target.value = "";
            if (categoria) aplicar(() => bulkRecategorize(seleccionados, categoria));
          }}
          className="w-auto"
        >
          <option value="">Cambiar categoría…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {presentCategory(c).label}
            </option>
          ))}
        </Select>

        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={borrar}>
          <Trash2 aria-hidden size={14} /> Borrar
        </Button>

        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onLimpiar}>
          <X aria-hidden size={14} /> Quitar selección
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
