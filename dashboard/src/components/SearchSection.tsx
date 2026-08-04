"use client";

import { useEffect, useState } from "react";
import type { Message } from "@prisma/client";
import { Search } from "lucide-react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { CATEGORIES, CATEGORY_PRESENTATION, type Category } from "@/lib/categories";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { MessageCard } from "./MessageCard";

const DEBOUNCE_MS = 300;

interface FetchState {
  /** Término, categoría y número de intento a los que corresponde este resultado. */
  query: string;
  categoria: Category | "todos";
  attempt: number;
  status: "error" | "done";
  results: Message[];
}

const INITIAL_FETCH_STATE: FetchState = {
  query: "",
  categoria: "todos",
  attempt: 0,
  status: "done",
  results: [],
};

export function SearchSection() {
  const [input, setInput] = useState("");
  const [categoria, setCategoria] = useState<Category | "todos">("todos");
  const [fetchState, setFetchState] = useState<FetchState>(INITIAL_FETCH_STATE);
  // Se incrementa para forzar una nueva búsqueda del mismo término (botón
  // "Reintentar"), sin duplicar la lógica de fetch en dos sitios.
  const [attempt, setAttempt] = useState(0);
  const debounced = useDebouncedValue(input, DEBOUNCE_MS);
  const query = debounced.trim();

  useEffect(() => {
    // Consulta vacía: no hay nada que pedir al servidor.
    if (query === "") return;

    const controller = new AbortController();
    const params = new URLSearchParams({ q: query });
    if (categoria !== "todos") params.set("categoria", categoria);

    fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`La búsqueda falló (${res.status}).`);
        return res.json() as Promise<{ results: Message[] }>;
      })
      .then((data) =>
        setFetchState({ query, categoria, attempt, status: "done", results: data.results }),
      )
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetchState({ query, categoria, attempt, status: "error", results: [] });
      });

    return () => controller.abort();
  }, [query, categoria, attempt]);

  // "loading" es un estado derivado, no uno propio: es verdad mientras el
  // último resultado que tenemos no corresponde al término/categoría/intento
  // actual.
  const isStale =
    fetchState.query !== query || fetchState.categoria !== categoria || fetchState.attempt !== attempt;
  const status = query === "" ? "idle" : isStale ? "loading" : fetchState.status;
  const results = fetchState.results;

  return (
    <section
      aria-labelledby="buscar-heading"
      className="fade-in flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm"
    >
      <h2
        id="buscar-heading"
        className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        <Search aria-hidden size={14} /> Buscar
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Buscar en tus mensajes…"
          aria-label="Buscar en tus mensajes"
          className="flex-1"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as Category | "todos")}
          aria-label="Filtrar por categoría"
          className="rounded-lg border border-paper-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <option value="todos">Todos</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_PRESENTATION[c].label}
            </option>
          ))}
        </select>
      </div>

      {status === "loading" && (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className="skeleton h-20" />
          ))}
        </ul>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <p>No se ha podido completar la búsqueda.</p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-2 focus-visible:ring-danger"
          >
            Reintentar
          </Button>
        </div>
      )}

      {status === "done" && results.length === 0 && (
        <p className="rounded-lg border border-dashed border-paper-line p-4 text-sm text-muted">
          No he encontrado nada que coincida con «{query}». Prueba con otra
          palabra.
        </p>
      )}

      {status === "done" && results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map((message) => (
            <MessageCard key={message.id} message={message} highlightQuery={query} />
          ))}
        </ul>
      )}
    </section>
  );
}
