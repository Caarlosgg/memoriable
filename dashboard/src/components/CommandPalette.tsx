"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageCircle,
  StickyNote,
  ListTodo,
  CalendarDays,
  PiggyBank,
  User,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { quickSearch } from "@/app/(dashboard)/actions";
import type { QuickSearchResult } from "@/lib/quickSearch";

/** Espera tras la última tecla antes de buscar — evita una consulta por pulsación. */
const SEARCH_DEBOUNCE_MS = 250;

interface PaletteItem {
  key: string;
  label: string;
  sublabel?: string;
  Icon: LucideIcon;
  onSelect: (router: ReturnType<typeof useRouter>) => void;
}

const NAV_ENTRIES: PaletteItem[] = [
  { key: "nav-asistente", label: "Asistente", Icon: MessageCircle, onSelect: (r) => r.push("/asistente") },
  { key: "nav-notas", label: "Notas", Icon: StickyNote, onSelect: (r) => r.push("/categorias") },
  { key: "nav-tablero", label: "Tablero", Icon: ListTodo, onSelect: (r) => r.push("/pendientes") },
  { key: "nav-calendario", label: "Calendario", Icon: CalendarDays, onSelect: (r) => r.push("/calendario") },
  { key: "nav-ahorros", label: "Ahorros", Icon: PiggyBank, onSelect: (r) => r.push("/ahorros") },
  { key: "nav-cuenta", label: "Cuenta", Icon: User, onSelect: (r) => r.push("/cuenta") },
];

const CREATE_ENTRIES: PaletteItem[] = [
  { key: "crear-nota", label: "Anotar algo nuevo", sublabel: "nota, tarea o recordatorio", Icon: PenLine, onSelect: (r) => r.push("/categorias") },
  { key: "crear-evento", label: "Nuevo evento", sublabel: "en el calendario", Icon: CalendarDays, onSelect: (r) => r.push("/calendario") },
  { key: "crear-ahorro", label: "Nueva cuenta de ahorro", Icon: PiggyBank, onSelect: (r) => r.push("/ahorros") },
];

const TIPO_ICON: Record<QuickSearchResult["tipo"], LucideIcon> = {
  nota: StickyNote,
  evento: CalendarDays,
  ahorro: PiggyBank,
};

/**
 * Paleta de comandos (Ctrl/Cmd+K): navegar, crear o buscar sin ratón. Vive
 * montada una vez en el layout del dashboard — el atajo global funciona
 * desde cualquier pantalla.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reinicia la selección cuando cambia la búsqueda — "ajustar estado
  // durante el render" (patrón de React) en vez de un efecto: mismo
  // criterio que ya usa CaptureForm.tsx con `seenSavedId`.
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setSelectedIndex(0);
  }

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearchError(null);
    setSelectedIndex(0);
  }, []);

  // Atajo global: Ctrl+K (Windows/Linux) o Cmd+K (Mac), desde cualquier pantalla.
  // El evento "open-command-palette" es el mismo camino que usan los botones
  // sin teclado (Sidebar, MobileHeader) — un único sitio que decide "abrir".
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const hasQuery = query.trim().length >= 2;

  // Búsqueda con debounce: el setState de "buscando"/resultado/error vive
  // SIEMPRE dentro del callback async (del timeout o de la promesa), nunca
  // síncrono en el cuerpo del efecto — mismo criterio que CuentaDetailDialog
  // (ver comentario histórico: react-hooks/set-state-in-effect). Sin query
  // suficiente no se programa nada; el render ignora `results`/`searching`/
  // `searchError` obsoletos porque están tapados por `hasQuery` más abajo.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      quickSearch(trimmed)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          if (!cancelled) setSearchError("No se ha podido buscar. Inténtalo de nuevo.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const items: PaletteItem[] = useMemo(() => {
    if (hasQuery) {
      return results.map(
        (r): PaletteItem => ({
          key: `result-${r.tipo}-${r.id}`,
          label: r.titulo,
          sublabel: r.subtitulo,
          Icon: TIPO_ICON[r.tipo],
          onSelect: (rt) => rt.push(r.href),
        }),
      );
    }
    return [...CREATE_ENTRIES, ...NAV_ENTRIES];
  }, [hasQuery, results]);

  // Selección efectiva: recortada al tamaño real de la lista en vez de
  // reajustada en un efecto aparte — así nunca apunta fuera de rango
  // aunque `items` cambie de tamaño (p. ej. llegan resultados más cortos)
  // sin que cambie `query`.
  const activeIndex = Math.min(selectedIndex, Math.max(items.length - 1, 0));

  function activate(item: PaletteItem) {
    item.onSelect(router);
    close();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) activate(item);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent
        className="top-24 flex max-h-[70vh] w-[calc(100%-2rem)] max-w-xl -translate-y-0 flex-col gap-0 overflow-hidden p-0"
        aria-label="Paleta de comandos"
      >
        <div className="flex items-center gap-2 border-b border-paper-line px-4 py-3">
          <Search aria-hidden size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar, navegar o crear…"
            aria-label="Buscar, navegar o crear"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="command-palette-list"
            aria-activedescendant={items[activeIndex] ? `command-item-${items[activeIndex].key}` : undefined}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded border border-paper-line px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">
            Esc
          </kbd>
        </div>

        <ul id="command-palette-list" role="listbox" className="flex-1 overflow-y-auto p-2">
          {hasQuery && searching && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted" aria-live="polite">
              <span className="skeleton h-4 w-4 rounded-full" /> Buscando…
            </li>
          )}
          {hasQuery && !searching && searchError && (
            <li role="alert" className="px-3 py-2 text-sm text-danger">
              {searchError}
            </li>
          )}
          {hasQuery && !searching && !searchError && items.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">Sin resultados para «{query.trim()}».</li>
          )}
          {(!hasQuery || (!searching && !searchError)) &&
            items.map((item, index) => {
              const Icon = item.Icon;
              const isSelected = index === activeIndex;
              return (
                <li key={item.key} id={`command-item-${item.key}`} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => activate(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isSelected ? "bg-accent-soft text-accent-strong" : "text-ink hover:bg-paper"
                    }`}
                  >
                    <Icon aria-hidden size={16} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.sublabel && <span className="shrink-0 truncate text-xs text-muted">{item.sublabel}</span>}
                  </button>
                </li>
              );
            })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
