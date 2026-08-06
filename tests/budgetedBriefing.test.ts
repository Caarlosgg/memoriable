import { describe, expect, it, vi } from 'vitest';
import { BudgetedBriefingGenerator } from '../src/ai/budgetedBriefing.js';
import type { BriefingGenerator, BriefingResult } from '../src/ai/briefing.js';
import type { BudgetGuard } from '../src/cost/budget.js';

const INPUT = { pending: [], eventosHoy: [], now: new Date() };
const RESULTADO_PAGO: BriefingResult = { misionPrincipal: 'de pago', bloqueManana: [], bloqueTarde: [], advertencias: [] };
const RESULTADO_OFFLINE: BriefingResult = { misionPrincipal: 'offline', bloqueManana: [], bloqueTarde: [], advertencias: [] };

function fakeBudget(allow: boolean): BudgetGuard {
  return {
    tryConsume: () => allow,
    snapshot: () => ({ day: '2026-08-06', used: 0, max: 10, remaining: allow ? 10 : 0, exhausted: !allow }),
  };
}

describe('BudgetedBriefingGenerator', () => {
  it('con presupuesto disponible, usa el generador de pago', async () => {
    const paid: BriefingGenerator = { generate: vi.fn().mockResolvedValue(RESULTADO_PAGO) };
    const fallback: BriefingGenerator = { generate: vi.fn().mockResolvedValue(RESULTADO_OFFLINE) };
    const generator = new BudgetedBriefingGenerator(paid, fallback, fakeBudget(true));

    const result = await generator.generate(INPUT);
    expect(result).toEqual(RESULTADO_PAGO);
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it('con el presupuesto agotado, cae al generador offline sin llamar al de pago', async () => {
    const paid: BriefingGenerator = { generate: vi.fn().mockResolvedValue(RESULTADO_PAGO) };
    const fallback: BriefingGenerator = { generate: vi.fn().mockResolvedValue(RESULTADO_OFFLINE) };
    const generator = new BudgetedBriefingGenerator(paid, fallback, fakeBudget(false));

    const result = await generator.generate(INPUT);
    expect(result).toEqual(RESULTADO_OFFLINE);
    expect(paid.generate).not.toHaveBeenCalled();
  });
});
