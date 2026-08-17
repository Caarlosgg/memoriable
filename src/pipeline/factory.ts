import { createGroqClient } from '../ai/groq.js';
import { GroqCategorizer } from '../ai/categorizer.js';
import { BudgetedCategorizer } from '../ai/budgetedCategorizer.js';
import { OfflineCategorizer } from '../ai/offlineCategorizer.js';
import { ResilientCategorizer } from '../ai/resilientCategorizer.js';
import { GeminiEmbedder, NullEmbedder } from '../ai/embedder.js';
import type { Categorizer, Embedder } from '../ai/types.js';
import { GroqTranscriber, NullTranscriber, type Transcriber } from '../ai/transcriber.js';
import { GroqBriefingGenerator, OfflineBriefingGenerator, type BriefingGenerator } from '../ai/briefing.js';
import { ResilientBriefingGenerator } from '../ai/resilientBriefing.js';
import { BudgetedBriefingGenerator } from '../ai/budgetedBriefing.js';
import { env, hasGroq, hasDatabase } from '../config/env.js';
import { DailyBudget, type BudgetGuard } from '../cost/budget.js';
import { DEFAULT_BUDGET_FILE, FileBudgetStore } from '../cost/fileBudgetStore.js';
import { InMemoryMessageRepository, type MessageRepository } from '../db/repository.js';
import { PrismaMessageRepository } from '../db/prismaRepository.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';
import type { Pipeline } from './processMessage.js';

/** Construye el fusible de coste diario respaldado en disco. */
export function resolveBudget(logger: Logger = rootLogger): BudgetGuard {
  const store = new FileBudgetStore(env.BUDGET_FILE ?? DEFAULT_BUDGET_FILE, (err) =>
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
 *          └─ GroqCategorizer → llamada real a Groq
 *
 * Ambas capas caen al categorizador offline, de modo que el pipeline siempre
 * devuelve una categorización aunque no haya API (o no convenga usarla).
 */
export function resolveCategorizer(logger: Logger = rootLogger): Categorizer {
  const offline = new OfflineCategorizer();

  if (!hasGroq()) {
    logger.warn('ai.offline_mode', {
      reason: 'GROQ_API_KEY no definida',
      action: 'se usa el categorizador heurístico offline',
    });
    return offline;
  }

  const groq = new GroqCategorizer(createGroqClient(), env.GROQ_MODEL);
  const resilient = new ResilientCategorizer(groq, offline, { logger });
  const budgeted = new BudgetedCategorizer(resilient, offline, resolveBudget(logger), { logger });

  logger.info('ai.online_mode', {
    model: env.GROQ_MODEL,
    maxMessagesPerDay: env.MAX_MESSAGES_PER_DAY,
  });
  return budgeted;
}

/**
 * Transcriptor de notas de voz — mismo proveedor (Groq) que el
 * categorizador, así que basta con `hasGroq()` para decidir si hay
 * transcripción real o no. Sin fusible de coste propio: una nota de voz es
 * un mensaje más, ya cubierto por el mismo `MAX_MESSAGES_PER_DAY` del
 * categorizador — no hace falta duplicar el control de gasto aquí.
 */
export function resolveTranscriber(logger: Logger = rootLogger): Transcriber {
  if (!hasGroq()) return new NullTranscriber();
  return new GroqTranscriber(createGroqClient(), logger);
}

/**
 * Elige el generador del Daily Briefing (Tier P1): mismas capas de
 * protección que `resolveCategorizer` (resiliente + fusible de coste,
 * caída a un generador offline determinista), reutilizando el MISMO
 * `BudgetGuard` que la categorización — un briefing es una llamada más
 * al mismo presupuesto diario, no uno aparte.
 */
export function resolveBriefingGenerator(logger: Logger = rootLogger): BriefingGenerator {
  const offline = new OfflineBriefingGenerator();

  if (!hasGroq()) {
    return offline;
  }

  const groq = new GroqBriefingGenerator(createGroqClient(), env.GROQ_MODEL);
  const resilient = new ResilientBriefingGenerator(groq, offline, { logger });
  return new BudgetedBriefingGenerator(resilient, offline, resolveBudget(logger), { logger });
}

/**
 * Elige el generador de embeddings según el entorno. Sin GEMINI_API_KEY,
 * `NullEmbedder` hace que el pipeline siga guardando mensajes con
 * normalidad, solo que sin embedding (backfill posterior).
 */
export function resolveEmbedder(logger: Logger = rootLogger): Embedder {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('embedding.disabled', {
      reason: 'GEMINI_API_KEY no definida',
      action: 'los mensajes se guardan sin embedding',
    });
    return new NullEmbedder();
  }

  return new GeminiEmbedder(apiKey, {
    model: env.GEMINI_MODEL,
    onWarning: (message) => logger.warn('embedding.failed', { message }),
  });
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
    embedder: resolveEmbedder(logger),
    logger,
  };
}
