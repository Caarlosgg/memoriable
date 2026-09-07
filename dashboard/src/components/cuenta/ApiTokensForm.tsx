"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Trash2, Check } from "lucide-react";
import { crearApiToken, revocarApiToken } from "@/app/(dashboard)/cuenta/actions";
import type { ApiTokenInfo } from "@/lib/apiTokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { haceCuanto } from "@/lib/format";

/**
 * Tokens de API personales.
 *
 * Es lo que permite que otras herramientas —un servidor MCP, un script,
 * otra IA— lean y escriban en MemorIAble. Hasta ahora todo iba por cookie
 * de sesión, así que nada externo podía integrarse.
 *
 * El token recién creado se enseña UNA vez y con un aviso claro: no se
 * guarda en claro (solo su hash), así que no hay forma de volver a verlo.
 * Mentir sobre eso —enseñarlo "por si acaso" en la lista— obligaría a
 * guardarlo recuperable, que es justo lo que no se quiere.
 */
export function ApiTokensForm({ tokens }: { tokens: ApiTokenInfo[] }) {
  const [nombre, setNombre] = useState("");
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await crearApiToken(nombre);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNuevo(result.token ?? null);
      setCopiado(false);
      setNombre("");
    });
  }

  function revocar(id: string, comoSeLlama: string) {
    if (!confirm(`¿Revocar «${comoSeLlama}»? Lo que lo use dejará de funcionar al instante.`)) return;
    startTransition(async () => {
      const result = await revocarApiToken(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="font-display text-lg text-ink">Tokens de API</p>
      <p className="text-sm text-muted">
        Para que otras herramientas puedan leer y escribir tus notas: un servidor MCP, un script
        propio, otra IA. Alcance: tu espacio personal.
      </p>

      {nuevo && (
        <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent-soft p-3">
          <p className="text-sm font-medium text-ink">
            Cópialo ahora: no se guarda y no se puede volver a ver.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-paper px-2 py-1.5 font-mono text-xs text-ink">
              {nuevo}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(nuevo).then(() => setCopiado(true));
              }}
            >
              {copiado ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={crear} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label htmlFor="token-nombre" className="text-sm font-medium text-ink">
            Nombre
          </label>
          <Input
            id="token-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Claude Desktop, script de backup…"
            maxLength={60}
            required
          />
        </div>
        <Button type="submit" disabled={pending || nombre.trim() === ""}>
          <KeyRound aria-hidden size={15} /> Crear token
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {tokens.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-paper-line px-3 py-2"
            >
              <span className="text-sm font-medium text-ink">{t.nombre}</span>
              <code className="font-mono text-xs text-muted">{t.prefijo}…</code>
              <span className="text-xs text-muted">
                {/* El último uso es lo que permite revocar con criterio: un
                    token que nadie usa desde hace meses sobra. */}
                {t.lastUsedAt ? `usado ${haceCuanto(t.lastUsedAt)}` : "sin usar todavía"}
              </span>
              <button
                type="button"
                onClick={() => revocar(t.id, t.nombre)}
                disabled={pending}
                aria-label={`Revocar el token ${t.nombre}`}
                className="ml-auto rounded-full p-1.5 text-muted transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <Trash2 aria-hidden size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
