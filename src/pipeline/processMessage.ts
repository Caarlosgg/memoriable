import type { Analysis, Categorizer, Embedder, IncomingMessage } from '../ai/types.js';
import type { MessageRepository, StoredMessage } from '../db/repository.js';
import { errorContext, type Logger } from '../logging/logger.js';
import { InvalidMessageError, sanitizeContent } from './sanitize.js';

export interface Pipeline {
  categorizer: Categorizer;
  repository: MessageRepository;
  /**
   * Opcional: sin él (o si falla), el mensaje se guarda igual, solo que sin
   * embedding — nunca bloquea el guardado (ver ai/embedder.ts).
   */
  embedder?: Embedder;
  /** Opcional: si no se pasa, el pipeline no registra nada (útil en tests). */
  logger?: Logger;
}

const noopLogger: Pick<Logger, 'info' | 'warn' | 'error'> = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Núcleo del sistema: sanea el mensaje entrante, lo analiza (categoría +
 * resumen) con el `Categorizer` y persiste el resultado con el `Repository`,
 * registrando cada paso de forma estructurada.
 *
 * No conoce Telegram, ni Prisma, ni la SDK de Groq: recibe sus
 * colaboradores por inyección, de modo que es totalmente testeable con mocks.
 *
 * Lanza `InvalidMessageError` si el contenido no es aprovechable (vacío o no
 * textual); cualquier otro fallo se registra y se propaga al llamante.
 */
export async function processMessage(
  message: IncomingMessage,
  userId: string,
  { categorizer, repository, embedder, logger }: Pipeline,
  /**
   * Se llama justo después de categorizar, con el análisis completo
   * (incluida `confianza`/`preguntaAclaratoria`, que no sobreviven al
   * guardado — Prisma solo devuelve columnas reales). Nunca cambia si se
   * guarda o no: guardar SIEMPRE sucede, pase lo que pase aquí — es solo
   * para que un llamante (p. ej. el bot de Telegram) pueda reaccionar a la
   * señal sin duplicar la llamada a la IA. Opcional: nadie más lo usa.
   */
  onAnalysis?: (analysis: Analysis) => void,
): Promise<StoredMessage> {
  const log = logger ?? noopLogger;
  const startedAt = Date.now();

  let sanitized;
  try {
    sanitized = sanitizeContent(message.contenido);
  } catch (err) {
    if (err instanceof InvalidMessageError) {
      log.warn('message.rejected', { reason: err.reason, tipo: message.tipo });
    }
    throw err;
  }

  if (sanitized.truncated) {
    log.warn('message.truncated', {
      originalLength: sanitized.originalLength,
      length: sanitized.length,
    });
  }

  const clean: IncomingMessage = { tipo: message.tipo, contenido: sanitized.contenido };

  try {
    // Categorizar (Groq) y generar el embedding (Gemini) no dependen entre
    // sí — los dos parten de `clean`, ninguno usa el resultado del otro —
    // así que van en paralelo en vez de en serie: recorta a la mitad la
    // latencia de este paso, que es justo lo que nota el usuario como
    // "tarda mucho" al crear una nota (desde la captura rápida o desde la
    // tool crearNota del Asistente, que reutiliza esta misma función).
    // `onAnalysis` sigue disparándose en cuanto categorizar resuelve, sin
    // esperar al embedding, para no romper su contrato ("justo después de
    // categorizar"). El embedding nunca bloquea el guardado: un fallo ya
    // vuelve `null` (ver ai/embedder.ts), y sin `embedder` inyectado
    // (tests, simulación) el mensaje se guarda igual, solo que sin él.
    const embeddingPromise: Promise<number[] | null> = embedder
      ? embedder.embedDocument(clean.contenido)
      : Promise.resolve(null);
    const analysisPromise = categorizer.analyze(clean).then((a) => {
      onAnalysis?.(a);
      return a;
    });
    const [analysis, embedding] = await Promise.all([analysisPromise, embeddingPromise]);
    const stored = await repository.save(userId, { ...clean, ...analysis, embedding });

    log.info('message.processed', {
      id: stored.id,
      tipo: stored.tipo,
      categoria: stored.categoria,
      length: sanitized.length,
      truncated: sanitized.truncated,
      durationMs: Date.now() - startedAt,
    });

    return stored;
  } catch (err) {
    log.error('message.failed', {
      tipo: clean.tipo,
      length: sanitized.length,
      durationMs: Date.now() - startedAt,
      ...errorContext(err),
    });
    throw err;
  }
}
