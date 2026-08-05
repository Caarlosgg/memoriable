"use client";

import { useEffect, useState } from "react";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import { Search, Tag } from "lucide-react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { CATEGORIES, CATEGORY_PRESENTATION, type Category } from "@/lib/categories";
import { ESTADOS_TABLERO, ESTADO_PRESENTATION, PRIORIDADES, PRIORIDAD_PRESENTATION } from "@/lib/kanban";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { MessageCard } from "./MessageCard";
import { MessageDetailDialog } from "./MessageDetailDialog";

const DEBOUNCE_MS = 300;

/** Mismas clases en los cuatro selects/fechas — un único sitio para que se vean iguales. */
const FILTER_CLASSNAME =
  "rounded-lg border border-paper-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

interface Filters {
  categoria: Category | "todos";
  estado: EstadoTarea | "todos";
  prioridad: Prioridad | "todos";
  desde: string;
  hasta: string;
}

const INITIAL_FILTERS: Filters = { categoria: "todos", estado: "todos", prioridad: "todos", desde: "", hasta: "" };

interface FetchState {
  /** Término, etiqueta, filtros y número de intento a los que corresponde este resultado. */
  query: string;
  etiqueta: string;
  filters: Filters;
  attempt: number;
  status: "error" | "done";
  results: Message[];
}

const INITIAL_FETCH_STATE: FetchState = {
  query: "",
  etiqueta: "",
  filters: INITIAL_FILTERS,
  attempt: 0,
  status: "done",
  results: [],
};

function sameFilters(a: Filters, b: Filters): boolean {
  return (
    a.categoria === b.categoria &&
    a.estado === b.estado &&
    a.prioridad === b.prioridad &&
    a.desde === b.desde &&
    a.hasta === b.hasta
  );
}

export function SearchSection() {
  const [input, setInput] = useState("");
  const [etiquetaInput, setEtiquetaInput] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [fetchState, setFetchState] = useState<FetchState>(INITIAL_FETCH_STATE);
  // Se incrementa para forzar una nueva búsqueda del mismo término (botón
  // "Reintentar"), sin duplicar la lógica de fetch en dos sitios.
  const [attempt, setAttempt] = useState(0);
  const debounced = useDebouncedValue(input, DEBOUNCE_MS);
  const query = debounced.trim();
  const etiqueta = useDebouncedValue(etiquetaInput, DEBOUNCE_MS).trim();

  useEffect(() => {
    // Consulta vacía: no hay nada que pedir al servidor.
    if (query === "") return;

    const controller = new AbortController();
    const params = new URLSearchParams({ q: query });
    if (filters.categoria !== "todos") params.set("categoria", filters.categoria);
    if (filters.estado !== "todos") params.set("estado", filters.estado);
    if (filters.prioridad !== "todos") params.set("prioridad", filters.prioridad);
    if (filters.desde) params.set("desde", filters.desde);
    if (filters.hasta) params.set("hasta", filters.hasta);
    if (etiqueta) params.set("etiqueta", etiqueta);

    fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`La búsqueda falló (${res.status}).`);
        return res.json() as Promise<{ results: Message[] }>;
      })
      .then((data) => setFetchState({ query, etiqueta, filters, attempt, status: "done", results: data.results }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetchState({ query, etiqueta, filters, attempt, status: "error", results: [] });
      });

    return () => controller.abort();
  }, [query, etiqueta, filters, attempt]);

  // "loading" es un estado derivado, no uno propio: es verdad mientras el
  // último resultado que tenemos no corresponde al término/etiqueta/filtros/
  // intento actuales.
  const isStale =
    fetchState.query !== query ||
    fetchState.etiqueta !== etiqueta ||
    !sameFilters(fetchState.filters, filters) ||
    fetchState.attempt !== attempt;
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

      <Input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Buscar en tus mensajes…"
        aria-label="Buscar en tus mensajes"
      />

      <div className="flex flex-wrap gap-2">
        <select
          value={filters.categoria}
          onChange={(e) => setFilters((f) => ({ ...f, categoria: e.target.value as Filters["categoria"] }))}
          aria-label="Filtrar por categoría"
          className={FILTER_CLASSNAME}
        >
          <option value="todos">Cualquier categoría</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_PRESENTATION[c].label}
            </option>
          ))}
        </select>
        <select
          value={filters.estado}
          onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value as Filters["estado"] }))}
          aria-label="Filtrar por estado"
          className={FILTER_CLASSNAME}
        >
          <option value="todos">Cualquier estado</option>
          {ESTADOS_TABLERO.map((estado) => (
            <option key={estado} value={estado}>
              {ESTADO_PRESENTATION[estado].label}
            </option>
          ))}
        </select>
        <select
          value={filters.prioridad}
          onChange={(e) => setFilters((f) => ({ ...f, prioridad: e.target.value as Filters["prioridad"] }))}
          aria-label="Filtrar por prioridad"
          className={FILTER_CLASSNAME}
        >
          <option value="todos">Cualquier prioridad</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {PRIORIDAD_PRESENTATION[p].label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.desde}
          onChange={(e) => setFilters((f) => ({ ...f, desde: e.target.value }))}
          aria-label="Desde qué fecha"
          className={FILTER_CLASSNAME}
        />
        <input
          type="date"
          value={filters.hasta}
          onChange={(e) => setFilters((f) => ({ ...f, hasta: e.target.value }))}
          aria-label="Hasta qué fecha"
          className={FILTER_CLASSNAME}
        />
        <div className="relative">
          <Tag aria-hidden size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={etiquetaInput}
            onChange={(e) => setEtiquetaInput(e.target.value)}
            placeholder="etiqueta"
            aria-label="Filtrar por etiqueta"
            className={`${FILTER_CLASSNAME} w-28 pl-7`}
          />
        </div>
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
          palabra o quita algún filtro.
        </p>
      )}

      {status === "done" && results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map((message) => (
            <MessageDetailDialog key={message.id} message={message}>
              <MessageCard message={message} highlightQuery={query} className="cursor-pointer" />
            </MessageDetailDialog>
          ))}
        </ul>
      )}
    </section>
  );
}
