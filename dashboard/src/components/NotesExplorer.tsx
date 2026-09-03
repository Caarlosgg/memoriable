"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import type { Message, EstadoTarea, Prioridad } from "@prisma/client";
import { Search, Tag, StickyNote } from "lucide-react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { CATEGORIES, CATEGORY_PRESENTATION, presentCategory, type Category } from "@/lib/categories";
import { ESTADOS_TABLERO, ESTADO_PRESENTATION, PRIORIDADES, PRIORIDAD_PRESENTATION } from "@/lib/kanban";
import type { CategoryGroup } from "@/lib/data";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { MessageCard } from "./MessageCard";
import { MessageDetailDialog } from "./MessageDetailDialog";
import { Select } from "./ui/select";
import { EmptyState } from "./ui/empty-state";

const DEBOUNCE_MS = 300;

interface Filters {
  categoria: Category | "todos";
  estado: EstadoTarea | "todos";
  prioridad: Prioridad | "todos";
  desde: string;
  hasta: string;
}

const INITIAL_FILTERS: Filters = { categoria: "todos", estado: "todos", prioridad: "todos", desde: "", hasta: "" };

/**
 * Cuántos resultados se piden por tanda. Mismo valor que `SEARCH_PAGE_SIZE`
 * en data.ts — aquí se repite en vez de importarlo porque este es un
 * componente de cliente y data.ts es "server-only".
 */
const PAGE_SIZE = 15;

interface FetchState {
  query: string;
  etiqueta: string;
  filters: Filters;
  attempt: number;
  /** Cuántos resultados se pidieron: forma parte de la identidad de la petición (ver `isStale`). */
  limite: number;
  status: "error" | "done";
  results: Message[];
  /** Total exacto — solo lo hay al FILTRAR sin texto (ver SearchResult en data.ts). */
  total?: number;
  hayMas: boolean;
}

const INITIAL_FETCH_STATE: FetchState = {
  query: "",
  etiqueta: "",
  filters: INITIAL_FILTERS,
  attempt: 0,
  limite: PAGE_SIZE,
  status: "done",
  results: [],
  hayMas: false,
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

function isDefaultFilters(f: Filters): boolean {
  return sameFilters(f, INITIAL_FILTERS);
}

/**
 * Lee los filtros de la URL. Un valor que no existe cae al de por defecto
 * en vez de romper: la URL la puede escribir cualquiera a mano, y una
 * pantalla en blanco por un parámetro mal escrito no ayuda a nadie.
 */
export function filtersFromParams(params: URLSearchParams | ReadonlyURLSearchParams): Filters {
  const leer = <T extends string>(clave: string, validos: readonly T[]): T | "todos" => {
    const v = params.get(clave);
    return v && (validos as readonly string[]).includes(v) ? (v as T) : "todos";
  };
  return {
    categoria: leer("categoria", CATEGORIES),
    estado: leer("estado", ESTADOS_TABLERO),
    prioridad: leer("prioridad", PRIORIDADES),
    desde: params.get("desde") ?? "",
    hasta: params.get("hasta") ?? "",
  };
}

/**
 * Notas: buscador y categorías vivían como dos pantallas casi idénticas
 * (ambas listas de `MessageCard`) con funcionalidad repartida sin motivo —
 * el filtro por estado/prioridad/etiqueta solo existía en una de las dos,
 * y "categorías" no tenía ni texto libre. Se unifican en una sola vista:
 * sin ningún filtro activo se ve la vista agrupada por categoría (la que
 * daba una visión general); en cuanto se escribe algo o se activa un
 * filtro, se cambia a lista plana con ese criterio — un único sitio para
 * "encontrar" y "explorar", con todos los filtros disponibles siempre.
 */
export function NotesExplorer({
  initialGroups,
  highlightId,
}: {
  initialGroups: CategoryGroup[];
  highlightId?: string;
}) {
  // Los filtros arrancan de la URL: así una búsqueda se puede compartir,
  // guardar en marcadores y sobrevive a ir a otra pantalla y volver. Antes
  // vivían solo en `useState` y se perdían en cuanto navegabas — con lo que
  // volver a una búsqueda de 8 filtros significaba rehacerla entera.
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [input, setInput] = useState(() => searchParams.get("q") ?? "");
  const [etiquetaInput, setEtiquetaInput] = useState(() => searchParams.get("etiqueta") ?? "");
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [fetchState, setFetchState] = useState<FetchState>(INITIAL_FETCH_STATE);
  const [attempt, setAttempt] = useState(0);
  // Cuántos resultados se están pidiendo. Sube al pulsar "ver más" y vuelve
  // a la primera tanda en cuanto cambia lo que se busca: si no, cambiar de
  // filtro heredaría una lista larguísima de la búsqueda anterior.
  const [limite, setLimite] = useState(PAGE_SIZE);

  /**
   * Cambiar lo que se busca vuelve a la primera tanda.
   *
   * Se envuelven los setters en vez de hacerlo con un efecto: un efecto que
   * llama a setState provoca un render de más y, aquí, una petición de más
   * (la del límite viejo con los filtros nuevos, abortada acto seguido).
   */
  const cambiarInput = (valor: string) => {
    setInput(valor);
    setLimite(PAGE_SIZE);
  };
  const cambiarEtiqueta = (valor: string) => {
    setEtiquetaInput(valor);
    setLimite(PAGE_SIZE);
  };
  const cambiarFiltros = (fn: (f: Filters) => Filters) => {
    setFilters(fn);
    setLimite(PAGE_SIZE);
  };
  // Borrado con margen de deshacer (Tier 1.3): mientras un id está aquí, se
  // oculta de toda vista (agrupada y filtrada) — vuelve si se deshace, se
  // queda oculto para siempre si el margen expira y se borra de verdad.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const hideMessage = (id: string) => setHiddenIds((prev) => new Set(prev).add(id));
  const unhideMessage = (id: string) =>
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const query = useDebouncedValue(input, DEBOUNCE_MS).trim();
  const etiqueta = useDebouncedValue(etiquetaInput, DEBOUNCE_MS).trim();

  const hasActiveFilters = query !== "" || etiqueta !== "" || !isDefaultFilters(filters);

  /** Devuelve la vista a "sin filtrar": lo piden tanto el botón de la barra como el estado vacío de "no coincide nada". */
  function limpiarFiltros() {
    setInput("");
    setEtiquetaInput("");
    setFilters(INITIAL_FILTERS);
    setLimite(PAGE_SIZE);
  }

  /**
   * Refleja en la URL lo que se está buscando.
   *
   * `history.replaceState` y NO `router.replace`: lo segundo es una
   * navegación de Next, y cada una vuelve a pedir el componente de servidor
   * de la página — o sea, recalcular la vista agrupada por categoría en
   * cada pulsación. Aquí no se quiere navegar, solo que la barra de
   * direcciones diga la verdad; es el caso que Next documenta expresamente
   * para usar la API nativa del historial.
   *
   * `replaceState` y no `pushState` por lo mismo de siempre: si cada tecla
   * dejara una entrada en el historial, "atrás" habría que pulsarlo una vez
   * por letra escrita. Y se trabaja sobre los valores ya debounceados.
   */
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (etiqueta) params.set("etiqueta", etiqueta);
    if (filters.categoria !== "todos") params.set("categoria", filters.categoria);
    if (filters.estado !== "todos") params.set("estado", filters.estado);
    if (filters.prioridad !== "todos") params.set("prioridad", filters.prioridad);
    if (filters.desde) params.set("desde", filters.desde);
    if (filters.hasta) params.set("hasta", filters.hasta);

    // `mensaje` (la nota que resalta el Asistente) no es un filtro y no lo
    // gestiona este componente: se conserva tal cual estuviera.
    const mensaje = new URLSearchParams(window.location.search).get("mensaje");
    if (mensaje) params.set("mensaje", mensaje);

    const nueva = params.toString();
    // Se compara contra la URL REAL, no contra `searchParams`: al escribir
    // con `replaceState`, el hook de Next no se entera del cambio y su
    // valor se quedaría atrás, disparando esto en bucle.
    if (nueva !== window.location.search.replace(/^\?/, "")) {
      history.replaceState(null, "", nueva ? `${pathname}?${nueva}` : pathname);
    }
  }, [query, etiqueta, filters, pathname]);

  useEffect(() => {
    if (!hasActiveFilters) return;

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (filters.categoria !== "todos") params.set("categoria", filters.categoria);
    if (filters.estado !== "todos") params.set("estado", filters.estado);
    if (filters.prioridad !== "todos") params.set("prioridad", filters.prioridad);
    if (filters.desde) params.set("desde", filters.desde);
    if (filters.hasta) params.set("hasta", filters.hasta);
    if (etiqueta) params.set("etiqueta", etiqueta);
    params.set("limite", String(limite));

    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`La búsqueda falló (${res.status}).`);
        return res.json() as Promise<{ results: Message[]; total?: number; hayMas: boolean }>;
      })
      .then((data) =>
        setFetchState({
          query,
          etiqueta,
          filters,
          attempt,
          limite,
          status: "done",
          results: data.results,
          total: data.total,
          hayMas: data.hayMas,
        }),
      )
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetchState({ query, etiqueta, filters, attempt, limite, status: "error", results: [], hayMas: false });
      });

    return () => controller.abort();
  }, [query, etiqueta, filters, attempt, limite, hasActiveFilters]);

  const isStale =
    fetchState.query !== query ||
    fetchState.etiqueta !== etiqueta ||
    !sameFilters(fetchState.filters, filters) ||
    fetchState.limite !== limite ||
    fetchState.attempt !== attempt;
  const status = isStale ? "loading" : fetchState.status;

  const hasAnyMessages = initialGroups.some((g) => g.total > 0);

  return (
    <section aria-labelledby="notas-heading" className="fade-in flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-4 shadow-sm">
        <h2
          id="notas-heading"
          className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
        >
          <Search aria-hidden size={14} /> Notas
        </h2>

        <Input
          type="search"
          value={input}
          onChange={(e) => cambiarInput(e.target.value)}
          placeholder="Buscar en tus notas…"
          aria-label="Buscar en tus notas"
        />

        <div className="flex flex-wrap gap-2">
          <Select
            value={filters.categoria}
            onChange={(e) => cambiarFiltros((f) => ({ ...f, categoria: e.target.value as Filters["categoria"] }))}
            aria-label="Filtrar por categoría"
          >
            <option value="todos">Cualquier categoría</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_PRESENTATION[c].label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.estado}
            onChange={(e) => cambiarFiltros((f) => ({ ...f, estado: e.target.value as Filters["estado"] }))}
            aria-label="Filtrar por estado"
          >
            <option value="todos">Cualquier estado</option>
            {ESTADOS_TABLERO.map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_PRESENTATION[estado].label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.prioridad}
            onChange={(e) => cambiarFiltros((f) => ({ ...f, prioridad: e.target.value as Filters["prioridad"] }))}
            aria-label="Filtrar por prioridad"
          >
            <option value="todos">Cualquier prioridad</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDAD_PRESENTATION[p].label}
              </option>
            ))}
          </Select>
          <input
            type="date"
            value={filters.desde}
            onChange={(e) => cambiarFiltros((f) => ({ ...f, desde: e.target.value }))}
            aria-label="Desde qué fecha"
          />
          <input
            type="date"
            value={filters.hasta}
            onChange={(e) => cambiarFiltros((f) => ({ ...f, hasta: e.target.value }))}
            aria-label="Hasta qué fecha"
          />
          <div className="relative">
            <Tag
              aria-hidden
              size={13}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={etiquetaInput}
              onChange={(e) => cambiarEtiqueta(e.target.value)}
              placeholder="etiqueta"
              aria-label="Filtrar por etiqueta"
              className="w-28 pl-7 text-sm"
            />
          </div>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={limpiarFiltros}>
              Quitar filtros
            </Button>
          )}
        </div>
      </div>

      {!hasActiveFilters && !hasAnyMessages && (
        /* El campo de captura está JUSTO ARRIBA en esta misma pantalla, así
           que se señala eso primero: antes este vacío mandaba al bot de
           Telegram como si fuera la única vía, y quien no quería usar
           Telegram concluía que la aplicación no era para él. */
        <EmptyState
          Icon={StickyNote}
          title="Aquí aparecerán tus notas"
          description="Escribe la primera ahí arriba y la IA la categoriza y resume sola. También puedes mandársela al bot de Telegram desde el móvil."
        />
      )}

      {!hasActiveFilters && hasAnyMessages && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {initialGroups.map((group) => (
            <CategoryColumn
              key={group.categoria}
              group={group}
              highlightId={highlightId}
              hiddenIds={hiddenIds}
              onDeleted={hideMessage}
              onUndoDelete={unhideMessage}
            />
          ))}
        </div>
      )}

      {hasActiveFilters && status === "loading" && (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className="skeleton h-20" />
          ))}
        </ul>
      )}

      {hasActiveFilters && status === "error" && (
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

      {hasActiveFilters && status === "done" && fetchState.results.length === 0 && (
        <EmptyState
          Icon={Search}
          title="Nada coincide con eso"
          description="Prueba con otra palabra o quita algún filtro."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={limpiarFiltros}>
              Quitar los filtros
            </Button>
          }
        />
      )}

      {hasActiveFilters && status === "done" && fetchState.results.length > 0 && (
        <>
          {/* Cuántos hay. Antes había un techo mudo de 15: no solo no se
              podían ver más, es que no había forma de saber que faltaban.
              El total solo se enseña cuando es EXACTO (filtrando sin texto);
              en una búsqueda por relevancia no existe tal número, así que se
              dice cuántos se están viendo y ya. */}
          <p className="text-xs text-muted" aria-live="polite">
            {fetchState.total !== undefined
              ? `${fetchState.results.length} de ${fetchState.total}`
              : `${fetchState.results.length} resultado${fetchState.results.length === 1 ? "" : "s"}`}
          </p>

          {/* `stagger`: los resultados entran escalonados (ver globals.css) en
              vez de aparecer todos de golpe — el ojo sigue el orden de
              relevancia en lugar de recibir un bloque entero de una vez. */}
          <ul className="stagger flex flex-col gap-3">
            {fetchState.results
              .filter((message) => !hiddenIds.has(message.id))
              .map((message, i) => (
                <MessageDetailDialog
                  key={message.id}
                  message={message}
                  onDeleted={hideMessage}
                  onUndoDelete={unhideMessage}
                >
                  <MessageCard
                    message={message}
                    highlightQuery={query}
                    className="cursor-pointer"
                    style={{ "--i": i } as React.CSSProperties}
                  />
                </MessageDetailDialog>
              ))}
          </ul>

          {fetchState.hayMas && (
            <Button
              type="button"
              variant="secondary"
              className="self-center"
              disabled={isStale}
              onClick={() => setLimite((n) => n + PAGE_SIZE)}
            >
              {isStale ? "Cargando…" : "Ver más"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function CategoryColumn({
  group,
  highlightId,
  hiddenIds,
  onDeleted,
  onUndoDelete,
}: {
  group: CategoryGroup;
  highlightId?: string;
  hiddenIds: Set<string>;
  onDeleted: (id: string) => void;
  onUndoDelete: (id: string) => void;
}) {
  const messages = group.messages.filter((m) => !hiddenIds.has(m.id));
  const { Icon, label, color, colorSoft } = presentCategory(group.categoria);
  const headingId = `categoria-${group.categoria}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="flex items-center gap-2 font-display text-base font-semibold text-ink">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${colorSoft} ${color}`}>
          <Icon aria-hidden size={15} />
        </span>
        {label}
        <span className="ml-auto rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-muted">
          {group.total}
        </span>
      </h3>

      {messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-paper-line p-4 text-sm text-muted">
          Nada por aquí todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => (
            <MessageDetailDialog key={message.id} message={message} onDeleted={onDeleted} onUndoDelete={onUndoDelete}>
              <MessageCard
                message={message}
                showCategory={false}
                highlighted={message.id === highlightId}
                className="cursor-pointer"
              />
            </MessageDetailDialog>
          ))}
        </ul>
      )}
    </section>
  );
}
