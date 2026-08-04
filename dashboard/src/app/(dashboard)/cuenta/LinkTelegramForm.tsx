"use client";

import { useState, useTransition } from "react";
import { generateTelegramLinkCode, type GenerateLinkCodeState } from "./actions";
import { formatDate } from "@/lib/format";

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
        <div className="fade-in rounded-lg border border-accent/30 bg-accent-soft p-3 text-sm">
          <p className="text-muted">
            Envía este mensaje al bot de Telegram (caduca a las {formatDate(state.expiresAt)}):
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-ink">
            /vincular {state.code}
          </p>
        </div>
      )}
    </div>
  );
}
