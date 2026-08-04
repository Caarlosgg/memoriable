"use client";

import { useState, useTransition } from "react";
import { generateTelegramLinkCode, type GenerateLinkCodeState } from "./actions";
import { formatDate } from "@/lib/format";

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
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        className="w-fit rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-all hover:-translate-y-px hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Generando…" : "Generar código de vínculo"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      {state.code && (
        <div className="fade-in flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent-soft p-3 text-sm">
          <p className="text-muted">Caduca a las {formatDate(state.expiresAt)}.</p>

          {BOT_USERNAME ? (
            <a
              href={`https://t.me/${BOT_USERNAME}?start=${state.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-all hover:-translate-y-px hover:bg-accent-strong"
            >
              Abrir Telegram y vincular
            </a>
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
