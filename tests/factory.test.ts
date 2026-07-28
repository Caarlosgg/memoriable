import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryLogger } from '../src/logging/logger.js';

describe('pipeline/factory', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('sin ANTHROPIC_API_KEY usa el categorizador offline y avisa', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { resolveCategorizer } = await import('../src/pipeline/factory.js');
    const { OfflineCategorizer } = await import('../src/ai/offlineCategorizer.js');
    const { logger, records } = createMemoryLogger();

    expect(resolveCategorizer(logger)).toBeInstanceOf(OfflineCategorizer);
    expect(records.find((r) => r.event === 'ai.offline_mode')).toMatchObject({ level: 'warn' });
  });

  it('con ANTHROPIC_API_KEY envuelve Claude en fusible de coste y resiliencia', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    const { resolveCategorizer } = await import('../src/pipeline/factory.js');
    const { BudgetedCategorizer } = await import('../src/ai/budgetedCategorizer.js');
    const { logger, records } = createMemoryLogger();

    // La capa externa es el fusible de coste: nada llega a la API sin pasar por él.
    expect(resolveCategorizer(logger)).toBeInstanceOf(BudgetedCategorizer);
    expect(records.find((r) => r.event === 'ai.online_mode')).toMatchObject({
      model: 'claude-haiku-4-5',
      maxMessagesPerDay: 50,
    });
  });

  it('sin DATABASE_URL usa el repositorio en memoria y avisa', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { resolveRepository } = await import('../src/pipeline/factory.js');
    const { InMemoryMessageRepository } = await import('../src/db/repository.js');
    const { logger, records } = createMemoryLogger();

    expect(resolveRepository(logger)).toBeInstanceOf(InMemoryMessageRepository);
    expect(records.find((r) => r.event === 'db.in_memory_mode')).toMatchObject({ level: 'warn' });
  });

  it('con DATABASE_URL usa el repositorio de Prisma', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    const { resolveRepository } = await import('../src/pipeline/factory.js');
    const { PrismaMessageRepository } = await import('../src/db/prismaRepository.js');
    const { logger } = createMemoryLogger();

    expect(resolveRepository(logger)).toBeInstanceOf(PrismaMessageRepository);
  });

  it('resolvePipeline devuelve las tres piezas listas', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('DATABASE_URL', '');
    const { resolvePipeline } = await import('../src/pipeline/factory.js');
    const { logger } = createMemoryLogger();

    const pipeline = resolvePipeline(logger);
    expect(pipeline.categorizer).toBeDefined();
    expect(pipeline.repository).toBeDefined();
    expect(pipeline.logger).toBe(logger);
  });

  it('el fusible respeta MAX_MESSAGES_PER_DAY del entorno', async () => {
    vi.stubEnv('MAX_MESSAGES_PER_DAY', '2');
    const { resolveBudget } = await import('../src/pipeline/factory.js');
    const { logger } = createMemoryLogger();

    expect(resolveBudget(logger).snapshot().max).toBe(2);
  });

  it('el fusible persiste en BUDGET_FILE cuando se define (necesario en Docker)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-test-'));
    const budgetFile = join(dir, 'budget.json');
    try {
      vi.stubEnv('BUDGET_FILE', budgetFile);
      const { resolveBudget } = await import('../src/pipeline/factory.js');
      const { logger } = createMemoryLogger();

      resolveBudget(logger).tryConsume();

      expect(existsSync(budgetFile)).toBe(true);
      expect(JSON.parse(readFileSync(budgetFile, 'utf8'))).toMatchObject({ used: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
