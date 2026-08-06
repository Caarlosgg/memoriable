import { describe, expect, it, vi } from 'vitest';
import { ResilientBriefingGenerator } from '../src/ai/resilientBriefing.js';
import { OfflineBriefingGenerator } from '../src/ai/briefing.js';
import type { BriefingGenerator, BriefingResult } from '../src/ai/briefing.js';
import { createMemoryLogger } from '../src/logging/logger.js';

const INPUT = { pending: [], eventosHoy: [], now: new Date('2026-08-06T09:00:00.000Z') };
const RESULTADO_OK: BriefingResult = { misionPrincipal: 'de la API', bloqueManana: [], bloqueTarde: [], advertencias: [] };

function build(primary: BriefingGenerator, policy = {}) {
  const { logger, records } = createMemoryLogger();
  const sleeps: number[] = [];
  const generator = new ResilientBriefingGenerator(primary, new OfflineBriefingGenerator(), {
    logger,
    policy: { baseDelayMs: 10, maxDelayMs: 100, timeoutMs: 50, ...policy },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
  });
  return { generator, records, sleeps };
}

function apiError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe('ResilientBriefingGenerator', () => {
  it('devuelve el resultado del generador principal si no falla', async () => {
    const primary: BriefingGenerator = { generate: vi.fn().mockResolvedValue(RESULTADO_OK) };
    const { generator } = build(primary);
    await expect(generator.generate(INPUT)).resolves.toEqual(RESULTADO_OK);
  });

  it('reintenta ante un fallo transitorio y acaba resolviendo', async () => {
    const primary: BriefingGenerator = {
      generate: vi
        .fn()
        .mockRejectedValueOnce(apiError(503))
        .mockResolvedValueOnce(RESULTADO_OK),
    };
    const { generator, sleeps } = build(primary, { retries: 2 });
    await expect(generator.generate(INPUT)).resolves.toEqual(RESULTADO_OK);
    expect(sleeps.length).toBe(1);
  });

  it('cae al generador offline si se agotan los reintentos', async () => {
    const primary: BriefingGenerator = { generate: vi.fn().mockRejectedValue(apiError(503)) };
    const { generator, records } = build(primary, { retries: 1 });
    const result = await generator.generate(INPUT);
    expect(result.misionPrincipal).toBeDefined(); // el offline siempre da algo
    expect(records.some((r) => r.event === 'briefing.fallback_offline')).toBe(true);
  });

  it('un 401 cae al offline sin reintentar (no merece la pena)', async () => {
    const generate = vi.fn().mockRejectedValue(apiError(401));
    const { generator } = build({ generate }, { retries: 3 });
    await generator.generate(INPUT);
    expect(generate).toHaveBeenCalledOnce();
  });

  it('un error permanente (no transitorio) no se reintenta', async () => {
    const generate = vi.fn().mockRejectedValue(apiError(400));
    const { generator } = build({ generate }, { retries: 3 });
    await generator.generate(INPUT);
    expect(generate).toHaveBeenCalledOnce();
  });
});
