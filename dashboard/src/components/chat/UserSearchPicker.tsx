"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { searchUsers, type UserSearchResult } from "@/app/(dashboard)/chat/actions";
import { shortEmailName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Buscador de personas con cuenta en MemorIAble por email, para invitar a
 * un chat — no hace falta que sean del mismo equipo (ver searchUsers,
 * chat/actions.ts). Un único sitio para el mismo patrón de "buscar +
 * lista de resultados" que usan NewConversationDialog (empezar una
 * conversación) y ConversationInfoDialog (añadir a un grupo ya existente).
 */
export function UserSearchPicker({
  excludeIds,
  onPick,
  placeholder = "Busca por email…",
}: {
  /** No mostrar a quien ya está en la lista (participantes actuales, o ya elegidos en este mismo diálogo). */
  excludeIds: Set<string>;
  onPick: (user: UserSearchResult) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const trimmedQuery = query.trim();
  const buscando = trimmedQuery.length >= 2;

  useEffect(() => {
    // Menos de 2 caracteres: nada que buscar todavía — no hace falta
    // limpiar `results`/`searching` aquí (serían resets síncronos de
    // estado derivable), el propio render ya oculta la lista mientras
    // `buscando` sea falso (ver `visibles` más abajo).
    if (!buscando) return;
    // Patrón estándar de "cargar al cambiar de query": el aviso de
    // "Buscando…" se enciende ANTES de lanzar la petición para que no
    // parpadeen resultados viejos mientras llega la nueva — el linter lo
    // marca como sospechoso por sistema, pero es justo el caso que
    // describe como válido ("actualizar sistema externo con el último
    // estado"), no un cálculo derivable del render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    const timer = setTimeout(() => {
      searchUsers(trimmedQuery)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedQuery, buscando]);

  const visibles = buscando ? results.filter((u) => !excludeIds.has(u.userId)) : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search aria-hidden size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-8"
        />
      </div>
      {buscando && (
        <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
          {searching && <li className="p-2 text-center text-xs text-muted">Buscando…</li>}
          {!searching && visibles.length === 0 && (
            <li className="p-2 text-center text-xs text-muted">Nadie con ese email en MemorIAble.</li>
          )}
          {!searching &&
            visibles.map((u) => (
              <li key={u.userId}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(u);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm text-ink transition-colors hover:bg-accent-soft"
                >
                  <Avatar email={u.email} size="sm" />
                  <span className="truncate">{shortEmailName(u.email)}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
