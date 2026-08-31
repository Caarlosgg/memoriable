"use client";

import { useState, useTransition } from "react";
import { Tag, Plus, X } from "lucide-react";
import {
  createCustomCategory,
  deleteCustomCategory,
  type CustomCategoryView,
} from "@/app/(dashboard)/cuenta/actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/**
 * Categorías propias (Fase 3 del roadmap del bot: "categorías
 * configurables") — a mayores de las 6 fijas, nunca las sustituyen. Hoy
 * solo se ASIGNAN desde el bot de Telegram (botón "🏷️ Recategorizar" →
 * selector, junto a las fijas); aquí es donde se crean y se borran.
 */
export function CustomCategoriesForm({ initialCategories }: { initialCategories: CustomCategoryView[] }) {
  const [categorias, setCategorias] = useState(initialCategories);
  const [nombre, setNombre] = useState("");
  const [emoji, setEmoji] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createCustomCategory(nombre, emoji);
      if (result.error || !result.categoria) {
        setError(result.error ?? "No se ha podido crear la categoría.");
        return;
      }
      // El id es el REAL del servidor, no uno provisional — así se puede
      // borrar de inmediato sin esperar a ningún refresco.
      setCategorias((prev) => [...prev, result.categoria!]);
      setNombre("");
      setEmoji("");
    });
  }

  function handleDelete(id: string) {
    const previous = categorias;
    setCategorias((prev) => prev.filter((c) => c.id !== id));
    startTransition(async () => {
      const result = await deleteCustomCategory(id);
      if (result.error) setCategorias(previous);
    });
  }

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 flex items-center gap-1.5 font-display text-lg text-ink">
        <Tag aria-hidden size={17} /> Categorías propias
      </p>
      <p className="mb-3 text-sm text-muted">
        A mayores de las 6 fijas — se asignan desde el bot de Telegram (botón &quot;Recategorizar&quot; sobre
        cualquier nota), sin cambiar su categoría de siempre.
      </p>

      {categorias.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {categorias.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-1 pl-2.5 text-xs font-medium text-accent-strong"
            >
              {c.emoji ? `${c.emoji} ` : ""}
              {c.nombre}
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                disabled={pending}
                aria-label={`Borrar la categoría ${c.nombre}`}
                className="rounded-full p-0.5 hover:bg-accent/30 disabled:opacity-60"
              >
                <X aria-hidden size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🎯"
          maxLength={8}
          aria-label="Emoji (opcional)"
          className="w-16 text-center"
        />
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la categoría…"
          maxLength={30}
          aria-label="Nombre de la nueva categoría"
          className="min-w-0 flex-1"
        />
        <Button type="button" onClick={handleCreate} disabled={pending || nombre.trim() === ""}>
          <Plus aria-hidden size={15} /> Añadir
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
