import type { Categorizer, Embedder, IncomingMessage } from '../ai/types.js';
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
    const analysis = await categorizer.analyze(clean);
    // Nunca bloquea el guardado: un fallo aquí ya vuelve `null` (ver
    // ai/embedder.ts), y sin `embedder` inyectado (tests, simulación) el
    // mensaje se guarda igual, solo que sin embedding.
    const embedding = (await embedder?.embedDocument(clean.contenido)) ?? null;
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
