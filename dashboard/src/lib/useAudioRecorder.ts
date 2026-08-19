"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type EstadoGrabacion = "inactivo" | "grabando" | "transcribiendo";

/** Corte automático — ver el comentario de MAX_AUDIO_BYTES en api/transcribir/route.ts: a este límite, la grabación nunca se acerca al tope de la plataforma. */
const MAX_SEGUNDOS = 60;

/**
 * Formatos que probar EN ORDEN. Los tres los transcribe Groq directamente
 * (`file` admite flac/mp3/mp4/mpeg/mpga/m4a/ogg/wav/webm — verificado en
 * node_modules/groq-sdk/resources/audio/transcriptions.d.ts) así que no
 * hace falta transcodificar nada en ningún lado: Chrome/Firefox/Edge graban
 * en webm+opus, Safari en mp4+aac, y si ninguno de los dos está disponible
 * se deja que el navegador elija el suyo por defecto.
 */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function mimeTypeSoportado(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Grabar con el micrófono y transcribir con Groq (ver /api/transcribir).
 * Nada de librerías de grabación ni de conversión de formato: `MediaRecorder`
 * nativo basta, porque Groq acepta directamente lo que graba cualquier
 * navegador (webm o mp4, según el caso).
 *
 * `soportado` cubre tanto la falta de la API (Safari viejo, WebViews
 * raros) como el contexto inseguro (`getUserMedia` exige HTTPS o
 * localhost) — sin esto, el botón se ofrecería en sitios donde iba a
 * fallar sí o sí.
 */
export function useAudioRecorder(onTranscript: (texto: string) => void) {
  const [estado, setEstado] = useState<EstadoGrabacion>("inactivo");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Distingue "el usuario pidió cancelar" de "se acabó el tiempo/pulsó
  // detener": el propio evento `onstop` de MediaRecorder es el mismo en los
  // dos casos, así que hace falta esta bandera para saber si transcribir.
  const canceladoRef = useRef(false);
  // `onTranscript` lo pasa quien llama, normalmente como función inline
  // (nueva en cada render). `iniciar`/`subirYTranscribir` se memorizan una
  // sola vez (para no reiniciar la grabación a medias si el padre
  // re-renderiza) — sin leer de un ref, se quedarían con el `onTranscript`
  // de la PRIMERA renderización para siempre, mismo motivo que
  // `byEstadoRef` en KanbanBoard.tsx.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const soportado =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    (typeof window.isSecureContext === "undefined" || window.isSecureContext);

  const limpiarStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clearInterval(tickRef.current);
    clearTimeout(autoStopRef.current);
  }, []);

  useEffect(() => () => limpiarStream(), [limpiarStream]);

  const subirYTranscribir = useCallback(async (blob: Blob) => {
    setEstado("transcribiendo");
    try {
      const formData = new FormData();
      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      formData.append("audio", blob, `nota.${extension}`);
      const res = await fetch("/api/transcribir", { method: "POST", body: formData });
      const data = (await res.json().catch(() => null)) as { texto?: string; error?: string } | null;
      if (!res.ok || !data?.texto) {
        setError(data?.error || "No se ha podido transcribir. Inténtalo de nuevo.");
        return;
      }
      onTranscriptRef.current(data.texto);
    } catch (err) {
      console.error("No se pudo subir la grabación:", err);
      setError("No se ha podido enviar la grabación. Comprueba tu conexión.");
    } finally {
      setEstado("inactivo");
    }
  }, []);

  const iniciar = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      canceladoRef.current = false;
      chunksRef.current = [];

      const mimeType = mimeTypeSoportado();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        limpiarStream();
        if (canceladoRef.current) {
          setEstado("inactivo");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType ?? (recorder.mimeType || "audio/webm") });
        void subirYTranscribir(blob);
      };

      recorder.start();
      setEstado("grabando");
      setSegundos(0);
      tickRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      autoStopRef.current = setTimeout(() => recorder.stop(), MAX_SEGUNDOS * 1000);
    } catch (err) {
      console.error("No se pudo acceder al micrófono:", err);
      setError("No se ha podido acceder al micrófono. Revisa los permisos del navegador.");
      setEstado("inactivo");
    }
  }, [limpiarStream, subirYTranscribir]);

  const detener = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }, []);

  const cancelar = useCallback(() => {
    canceladoRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    else limpiarStream();
    setEstado("inactivo");
  }, [limpiarStream]);

  return { estado, segundos, error, soportado, iniciar, detener, cancelar };
}
