"use client";

import { useState, useTransition } from "react";
import { Share2, Copy, Check, X } from "lucide-react";
import { toggleShare } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";

/**
 * Botón "Compartir" de una nota — enlace público de solo lectura (ver
 * `toggleShare` en actions.ts y la página pública en
 * app/compartido/[token]/page.tsx). Alterna entre compartir y revocar,
 * mismo botón: no hace falta un control aparte para lo segundo.
 *
 * La URL se construye aquí, no en el servidor: solo el CLIENTE sabe de
 * verdad en qué origen se está sirviendo la página (dominio propio,
 * preview de Vercel, `localhost` en desarrollo).
 */
export function ShareButton({ messageId, shareToken: initial }: { messageId: string; shareToken: string | null }) {
  const [shareToken, setShareToken] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function alternar() {
    setError(null);
    startTransition(async () => {
      const result = await toggleShare(messageId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShareToken(result.shareToken ?? null);
      setCopiado(false);
    });
  }

  if (!shareToken) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={alternar}>
          <Share2 aria-hidden size={14} /> Compartir
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const url = `${window.location.origin}/compartido/${shareToken}`;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <code className="max-w-[12rem] truncate rounded bg-paper px-2 py-1.5 font-mono text-xs text-ink" title={url}>
          {url}
        </code>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopiado(true));
          }}
        >
          {copiado ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={alternar} title="Dejar de compartir">
          <X aria-hidden size={14} />
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
