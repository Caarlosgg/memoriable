import type { Embedder } from './types.js';

/**
 * Embedder que no genera nada. Se usa cuando falta `GEMINI_API_KEY`: el
 * pipeline sigue guardando mensajes con normalidad, solo que sin embedding
 * (rellenable después con el script de backfill).
 */
export class NullEmbedder implements Embedder {
  async embedDocument(_text: string): Promise<null> {
    return null;
  }

  async embedQuery(_text: string): Promise<null> {
    return null;
  }
}

type TaskType =
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | 'SEMANTIC_SIMILARITY';

interface EmbedContentResponse {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
}

export interface GeminiEmbedderOptions {
  model?: string;
  /** Dimensiones truncadas (Matryoshka). Por defecto 768, ver config/env.ts. */
  outputDimensionality?: number;
  /** Inyectable para tests; por defecto el `fetch` global. */
  fetchFn?: typeof fetch;
  /** Avisos no fatales (fallo de red, respuesta inesperada, etc.). */
  onWarning?: (message: string) => void;
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Embedder respaldado por la API de Gemini (gratuita: 1500 peticiones/día
 * sin tarjeta). Se implementa con `fetch` directo en vez de añadir el SDK
 * `@google/genai`: la llamada es una única petición REST sin streaming ni
 * necesidades avanzadas, así que un SDK completo sería peso sin beneficio
 * — y mantiene este archivo copiable tal cual al dashboard (mismo patrón
 * que categorizer.ts en dashboard/src/lib/botPipeline/).
 *
 * Nunca lanza: cualquier fallo (red, HTTP, respuesta rara) se registra como
 * aviso y devuelve `null`, igual que hace el resto del pipeline ante un
 * fallo de IA no crítico.
 */
export class GeminiEmbedder implements Embedder {
  private readonly model: string;
  private readonly outputDimensionality: number;
  private readonly fetchFn: typeof fetch;
  private readonly onWarning: (message: string) => void;

  constructor(
    private readonly apiKey: string,
    options: GeminiEmbedderOptions = {},
  ) {
    this.model = options.model ?? 'gemini-embedding-001';
    this.outputDimensionality = options.outputDimensionality ?? 768;
    this.fetchFn = options.fetchFn ?? fetch;
    this.onWarning = options.onWarning ?? (() => {});
  }

  async embedDocument(text: string): Promise<number[] | null> {
    return this.embed(text, 'RETRIEVAL_DOCUMENT');
  }

  async embedQuery(text: string): Promise<number[] | null> {
    return this.embed(text, 'RETRIEVAL_QUERY');
  }

  private async embed(text: string, taskType: TaskType): Promise<number[] | null> {
    try {
      const res = await this.fetchFn(`${API_BASE}/${this.model}:embedContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: this.outputDimensionality,
        }),
      });

      if (!res.ok) {
        this.onWarning(`Gemini embedContent respondió ${res.status}: ${await res.text()}`);
        return null;
      }

      const data = (await res.json()) as EmbedContentResponse;
      // La forma exacta de la respuesta no está 100% documentada de forma
      // consistente entre el endpoint singular y el de batch; se aceptan
      // ambas por si acaso.
      const values = data.embedding?.values ?? data.embeddings?.[0]?.values;
      if (!Array.isArray(values) || values.length === 0) {
        this.onWarning('Gemini embedContent no devolvió un vector válido.');
        return null;
      }
      return values;
    } catch (err) {
      this.onWarning(`Fallo al generar embedding con Gemini: ${String(err)}`);
      return null;
    }
  }
}
