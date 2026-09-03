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
            // Botón Y QR, no uno u otro: el caso real es que estás en el
            // ordenador y Telegram lo tienes en el móvil. El botón sirve a
            // quien tiene Telegram de escritorio; el QR, a todos los demás,
            // que si no tendrían que copiar el código a mano de una
            // pantalla a otra.
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild className="w-fit">
                <a href={`https://t.me/${BOT_USERNAME}?start=${state.code}`} target="_blank" rel="noopener noreferrer">
                  <Send aria-hidden size={15} /> Abrir Telegram y vincular
                </a>
              </Button>
              {state.qrDataUrl && (
                <figure className="flex flex-col items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data-URI generado al vuelo: next/image no puede optimizar lo que no tiene URL */}
                  <img
                    src={state.qrDataUrl}
                    alt={`Código QR para vincular Telegram con el código ${state.code}`}
                    width={110}
                    height={110}
                    className="rounded-lg border border-paper-line"
                  />
                  <figcaption className="text-xs text-muted">o escanéalo con el móvil</figcaption>
                </figure>
              )}
            </div>
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
