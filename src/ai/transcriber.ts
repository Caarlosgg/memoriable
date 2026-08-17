import { createGroqClient } from './groq.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';

/**
 * Transcribe una nota de voz a texto — la extensión natural de "captura sin
 * fricción" (Telegram ya soporta audio; no hace falta que el usuario
 * escriba). Interfaz mínima para poder sustituirla por un doble en tests,
 * mismo criterio que Categorizer/Embedder.
 */
export interface Transcriber {
  /** `audioUrl`: URL pública temporal del fichero de audio (Telegram la da via getFileLink) — null si no se ha podido transcribir. */
  transcribe(audioUrl: string): Promise<string | null>;
}

const MODEL = 'whisper-large-v3-turbo';

/** Recorte mínimo del SDK de Groq que de verdad se usa — mismo criterio que `GroqChatClient` en categorizer.ts: permite un doble de test sin arrastrar el cliente real. */
export interface GroqTranscriptionClient {
  audio: {
    transcriptions: {
      create(params: {
        url: string;
        model: string;
        language: string;
        response_format: 'json';
      }): Promise<{ text: string }>;
    };
  };
}

/**
 * Transcripción real vía Groq (mismo proveedor que ya categoriza/resume —
 * sin SDK ni cuenta nueva). Se le pasa la URL del audio directamente
 * (`url`, no `file`): Groq la descarga él mismo, así que no hace falta
 * bajar el fichero de Telegram a mano solo para volver a subirlo.
 */
export class GroqTranscriber implements Transcriber {
  constructor(
    private readonly client: GroqTranscriptionClient = createGroqClient(),
    private readonly logger: Logger = rootLogger,
  ) {}

  async transcribe(audioUrl: string): Promise<string | null> {
    try {
      const result = await this.client.audio.transcriptions.create({
        url: audioUrl,
        model: MODEL,
        language: 'es',
        response_format: 'json',
      });
      const text = result.text?.trim();
      return text || null;
    } catch (err) {
      this.logger.error('transcriber.failed', errorContext(err));
      return null;
    }
  }
}

/** Sin GROQ_API_KEY: las notas de voz siguen sin bloquear el bot, solo se avisa de que no se ha podido transcribir (ver bot.ts). */
export class NullTranscriber implements Transcriber {
  async transcribe(_audioUrl: string): Promise<string | null> {
    return null;
  }
}
