"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { generateTelegramLinkCode, type GenerateLinkCodeState } from "./actions";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

// Público a propósito (NEXT_PUBLIC_*): el nombre de usuario de un bot de
// Telegram ya es público por naturaleza (aparece en la URL de cualquiera
// que lo use). Sin esta variable, se cae al mensaje manual /vincular.
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

export function LinkTelegramForm() {
  const [state, setState] = useState<GenerateLinkCodeState>({});
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      setState(await generateTelegramLinkCode());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={handleGenerate} disabled={pending} className="w-fit">
        {pending ? "Generando…" : "Generar código de vínculo"}
      </Button>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      {state.code && (
        <div className="fade-in flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent-soft p-3 text-sm">
          <p className="text-muted">Caduca a las {formatDate(state.expiresAt)}.</p>

          {BOT_USERNAME ? (
            <Button asChild className="w-fit">
              <a href={`https://t.me/${BOT_USERNAME}?start=${state.code}`} target="_blank" rel="noopener noreferrer">
                <Send aria-hidden size={15} /> Abrir Telegram y vincular
              </a>
            </Button>
          ) : (
            <>
              <p className="text-muted">Envía este mensaje al bot de Telegram:</p>
              <p className="font-mono text-lg font-semibold tracking-widest text-ink">
                /vincular {state.code}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
