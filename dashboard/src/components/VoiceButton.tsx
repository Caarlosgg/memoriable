"use client";

import { Mic, Square, X, Loader2 } from "lucide-react";
import { useAudioRecorder } from "@/lib/useAudioRecorder";
import { Button } from "./ui/button";

function formatSegundos(s: number): string {
  return `0:${String(s).padStart(2, "0")}`;
}

/**
 * Botón de dictado por voz — grabar → transcribir con Groq (ver
 * /api/transcribir) → `onTranscript`. Un único componente para los tres
 * sitios donde tiene sentido dictar (Asistente, captura rápida, chat), en
 * vez de reimplementar la grabación en cada uno.
 *
 * Rellena el campo, no envía solo: Whisper se equivoca con nombres propios
 * y cifras, y esa fricción de revisar antes de mandar es menor que la de
 * corregir un mensaje ya enviado.
 */
export function VoiceButton({
  onTranscript,
  puedeGrabar,
  className,
}: {
  onTranscript: (texto: string) => void;
  /** Resuelto en el servidor (`isVoiceConfigured`) — sin GROQ_API_KEY no se ofrece un botón que va a fallar siempre. */
  puedeGrabar: boolean;
  className?: string;
}) {
  const { estado, segundos, error, soportado, iniciar, detener, cancelar } = useAudioRecorder(onTranscript);

  if (!puedeGrabar || !soportado) return null;

  if (estado === "grabando") {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft py-1 pr-1 pl-3">
        <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
        <span className="text-xs font-medium tabular-nums text-danger" role="status">
          {formatSegundos(segundos)}
        </span>
        <button
          type="button"
          onClick={detener}
          aria-label="Terminar grabación y transcribir"
          title="Terminar y transcribir"
          className="rounded-full p-1.5 text-danger transition-colors hover:bg-danger/20 focus-visible:ring-2 focus-visible:ring-danger focus-visible:outline-none"
        >
          <Square aria-hidden size={13} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={cancelar}
          aria-label="Cancelar grabación"
          title="Cancelar"
          className="rounded-full p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-danger focus-visible:outline-none"
        >
          <X aria-hidden size={13} />
        </button>
      </div>
    );
  }

  if (estado === "transcribiendo") {
    return (
      <Button type="button" variant="secondary" size="icon" disabled aria-label="Transcribiendo…" className={className}>
        <Loader2 aria-hidden size={16} className="animate-spin motion-reduce:animate-none" />
      </Button>
    );
  }

  return (
    <div className={className}>
      <Button type="button" variant="secondary" size="icon" onClick={iniciar} aria-label="Dictar por voz">
        <Mic aria-hidden size={16} />
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
