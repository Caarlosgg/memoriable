import { createGroqClient } from './groq.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';

/**
 * Lee una imagen y devuelve su contenido como texto — la última pata de
 * "captura sin fricción".
 *
 * Hasta ahora una foto mandada al bot se ignoraba **sin responder nada**:
 * el usuario echaba una foto de un ticket, de una pizarra o de un albarán y
 * no pasaba absolutamente nada, ni siquiera un aviso. Y es justo el gesto
 * más natural desde el móvil.
 *
 * Interfaz mínima para poder sustituirla por un doble en tests, mismo
 * criterio que Categorizer/Embedder/Transcriber.
 */
export interface ImageReader {
  /**
   * `imageUrl`: URL pública temporal de la imagen (Telegram la da vía
   * `getFileLink`). `caption` es el pie de foto, si el usuario escribió uno
   * — vale como contexto, no como sustituto. `null` si no se ha podido
   * leer nada aprovechable.
   */
  read(imageUrl: string, caption?: string): Promise<string | null>;
}

/**
 * Modelo con visión servido por Groq. Se elige el mismo proveedor que ya
 * categoriza y transcribe: sin SDK nueva, sin cuenta nueva y bajo el mismo
 * fusible de coste.
 */
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

/**
 * No es "descríbeme la foto": es "conviértela en la nota que su dueño
 * habría escrito". De ahí el énfasis en transcribir lo escrito y en no
 * inventar — una foto de un ticket vale por sus importes, no por "una
 * imagen de un recibo sobre una mesa".
 */
const PROMPT = [
  'Eres la vista de un sistema de notas. Convierte esta imagen en el texto que su dueño querría tener guardado.',
  'Si hay texto escrito (un ticket, una pizarra, una nota a mano, una pantalla), transcríbelo literalmente y en orden.',
  'Si no hay texto, describe en una o dos frases lo que hace falta recordar de la imagen.',
  'No inventes datos que no se vean. No añadas comentarios tuyos ni preámbulos: devuelve solo el contenido.',
  'Responde en español.',
].join(' ');

/** Recorte mínimo del SDK de Groq que de verdad se usa — mismo criterio que `GroqChatClient` en categorizer.ts. */
export interface GroqVisionClient {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: {
          role: 'user';
          content: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];
        }[];
        temperature?: number;
        max_completion_tokens?: number;
      }): Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
}

export class GroqImageReader implements ImageReader {
  constructor(
    private readonly client: GroqVisionClient = createGroqClient() as unknown as GroqVisionClient,
    private readonly logger: Logger = rootLogger,
  ) {}

  async read(imageUrl: string, caption?: string): Promise<string | null> {
    try {
      const instruccion = caption?.trim()
        ? `${PROMPT}\n\nEl usuario ha escrito este pie de foto, úsalo como contexto: "${caption.trim()}"`
        : PROMPT;

      const result = await this.client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: instruccion },
              // Groq descarga la URL él mismo, igual que en la transcripción:
              // no hace falta bajar el fichero de Telegram para volver a subirlo.
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.2,
        max_completion_tokens: 700,
      });

      const text = result.choices[0]?.message.content?.trim();
      return text || null;
    } catch (err) {
      this.logger.error('image_reader.failed', errorContext(err));
      return null;
    }
  }
}

/** Sin GROQ_API_KEY: las fotos no tumban el bot, solo se avisa de que no se han podido leer (ver bot.ts). */
export class NullImageReader implements ImageReader {
  async read(_imageUrl: string, _caption?: string): Promise<string | null> {
    return null;
  }
}
