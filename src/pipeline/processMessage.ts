import type { Categorizer, IncomingMessage } from '../ai/types.js';
import type { MessageRepository, StoredMessage } from '../db/repository.js';

export interface Pipeline {
  categorizer: Categorizer;
  repository: MessageRepository;
}

/**
 * Núcleo del sistema: dado un mensaje entrante, lo analiza (categoría +
 * resumen) con el `Categorizer` y persiste el resultado con el `Repository`.
 *
 * No conoce Telegram, ni Prisma, ni la SDK de Anthropic: recibe sus
 * colaboradores por inyección, de modo que es totalmente testeable con mocks.
 */
export async function processMessage(
  message: IncomingMessage,
  { categorizer, repository }: Pipeline,
): Promise<StoredMessage> {
  const analysis = await categorizer.analyze(message);
  return repository.save({ ...message, ...analysis });
}
