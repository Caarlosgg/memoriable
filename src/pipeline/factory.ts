import { createAnthropicClient } from '../ai/anthropic.js';
import { AnthropicCategorizer } from '../ai/categorizer.js';
import { BudgetedCategorizer } from '../ai/budgetedCategorizer.js';
import { OfflineCategorizer } from '../ai/offlineCategorizer.js';
import { ResilientCategorizer } from '../ai/resilientCategorizer.js';
import type { Categorizer } from '../ai/types.js';
import { env, hasAnthropic, hasDatabase } from '../config/env.js';
import { DailyBudget, type BudgetGuard } from '../cost/budget.js';
import { DEFAULT_BUDGET_FILE, FileBudgetStore } from '../cost/fileBudgetStore.js';
import { InMemoryMessageRepository, type MessageRepository } from '../db/repository.js';
import { PrismaMessageRepository } from '../db/prismaRepository.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';
import type { Pipeline } from './processMessage.js';

/** Construye el fusible de coste diario respaldado en disco. */
export function resolveBudget(logger: Logger = rootLogger): BudgetGuard {
  const store = new FileBudgetStore(DEFAULT_BUDGET_FILE, (err) =>
    logger.warn('cost.budget_store_error', errorContext(err)),
  );
  return new DailyBudget(env.MAX_MESSAGES_PER_DAY, store);
}

/**
 * Elige el categorizador según el entorno y lo envuelve en las capas de
 * protección. Orden de las capas (de fuera a dentro):
 *
 *   BudgetedCategorizer  → corta el gasto cuando se agota el presupuesto
 *     └─ ResilientCategorizer → timeout + reintentos con backoff
 *          └─ AnthropicCategorizer → llamada real a Claude
 *
 * Ambas capas caen al categorizador offline, de modo que el pipeline siempre
 * devuelve una categorización aunque no haya API (o no convenga usarla).
 */
export function resolveCategorizer(logger: Logger = rootLogger): Categorizer {
  const offline = new OfflineCategorizer();

  if (!hasAnthropic()) {
    logger.warn('ai.offline_mode', {
      reason: 'ANTHROPIC_API_KEY no definida',
      action: 'se usa el categorizador heurístico offline',
    });
    return offline;
  }

  const claude = new AnthropicCategorizer(createAnthropicClient());
  const resilient = new ResilientCategorizer(claude, offline, { logger });
  const budgeted = new BudgetedCategorizer(resilient, offline, resolveBudget(logger), { logger });

  logger.info('ai.online_mode', {
    model: env.ANTHROPIC_MODEL,
    maxMessagesPerDay: env.MAX_MESSAGES_PER_DAY,
  });
  return budgeted;
}

/**
 * Elige el repositorio según el entorno: Prisma/PostgreSQL si hay `DATABASE_URL`,
 * en memoria en caso contrario.
 */
export function resolveRepository(logger: Logger = rootLogger): MessageRepository {
  if (!hasDatabase()) {
    logger.warn('db.in_memory_mode', {
      reason: 'DATABASE_URL no definida',
      action: 'los mensajes NO se persisten entre reinicios',
    });
    return new InMemoryMessageRepository();
  }
  return new PrismaMessageRepository();
}

/** Construye el pipeline por defecto a partir del entorno. */
export function resolvePipeline(logger: Logger = rootLogger): Pipeline {
  return {
    categorizer: resolveCategorizer(logger),
    repository: resolveRepository(logger),
    logger,
  };
}
