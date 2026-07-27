import { createAnthropicClient } from '../ai/anthropic.js';
import { AnthropicCategorizer } from '../ai/categorizer.js';
import { OfflineCategorizer } from '../ai/offlineCategorizer.js';
import type { Categorizer } from '../ai/types.js';
import { InMemoryMessageRepository, type MessageRepository } from '../db/repository.js';
import { PrismaMessageRepository } from '../db/prismaRepository.js';
import { hasAnthropic, hasDatabase } from '../config/env.js';
import type { Pipeline } from './processMessage.js';

/**
 * Elige el categorizador según el entorno: Claude si hay API key, heurístico
 * offline en caso contrario (para poder simular sin servicios reales).
 */
export function resolveCategorizer(): Categorizer {
  return hasAnthropic() ? new AnthropicCategorizer(createAnthropicClient()) : new OfflineCategorizer();
}

/**
 * Elige el repositorio según el entorno: Prisma/PostgreSQL si hay `DATABASE_URL`,
 * en memoria en caso contrario.
 */
export function resolveRepository(): MessageRepository {
  return hasDatabase() ? new PrismaMessageRepository() : new InMemoryMessageRepository();
}

/** Construye el pipeline por defecto a partir del entorno. */
export function resolvePipeline(): Pipeline {
  return { categorizer: resolveCategorizer(), repository: resolveRepository() };
}
