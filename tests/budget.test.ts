import { describe, expect, it, vi } from 'vitest';
import { DailyBudget, InMemoryBudgetStore, utcDay } from '../src/cost/budget.js';
import { BudgetedCategorizer } from '../src/ai/budgetedCategorizer.js';
import { OfflineCategorizer } from '../src/ai/offlineCategorizer.js';
import { createMemoryLogger } from '../src/logging/logger.js';
import type { Categorizer } from '../src/ai/types.js';

describe('DailyBudget', () => {
  it('permite consumir hasta el máximo y luego funde el fusible', () => {
    const budget = new DailyBudget(3);
    expect([budget.tryConsume(), budget.tryConsume(), budget.tryConsume()]).toEqual([
      true,
      true,
      true,
    ]);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.snapshot()).toMatchObject({ used: 3, max: 3, remaining: 0, exhausted: true });
  });

  it('con max=0 bloquea toda llamada de pago (modo offline total)', () => {
    const budget = new DailyBudget(0);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.snapshot().exhausted).toBe(true);
  });

  it('se reinicia solo al cambiar el día UTC', () => {
    let ahora = new Date('2026-03-10T23:59:00.000Z');
    const budget = new DailyBudget(2, new InMemoryBudgetStore(), () => ahora);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);

    ahora = new Date('2026-03-11T00:01:00.000Z');
    expect(budget.tryConsume()).toBe(true);
    expect(budget.snapshot()).toMatchObject({ day: '2026-03-11', used: 1, remaining: 1 });
  });

  it('el contador sobrevive si el almacén persiste (protege ante crash-loop)', () => {
    const store = new InMemoryBudgetStore();
    const ahora = () => new Date('2026-03-10T10:00:00.000Z');

    new DailyBudget(2, store, ahora).tryConsume();
    // Simula un reinicio del proceso: nueva instancia, mismo almacén.
    const trasReinicio = new DailyBudget(2, store, ahora);

    expect(trasReinicio.snapshot().used).toBe(1);
    expect(trasReinicio.tryConsume()).toBe(true);
    expect(trasReinicio.tryConsume()).toBe(false);
  });

  it('utcDay formatea en YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-07-28T22:15:00.000Z'))).toBe('2026-07-28');
  });
});

describe('BudgetedCategorizer', () => {
  const mensaje = { tipo: 'text', contenido: 'Comprar pan' };

  function paidStub(): Categorizer {
    return { analyze: vi.fn().mockResolvedValue({ categoria: 'idea', resumen: 'de pago' }) };
  }

  it('usa el categorizador de pago mientras queda presupuesto', async () => {
    const paid = paidStub();
    const categorizer = new BudgetedCategorizer(paid, new OfflineCategorizer(), new DailyBudget(5));

    await expect(categorizer.analyze(mensaje)).resolves.toMatchObject({ resumen: 'de pago' });
    expect(paid.analyze).toHaveBeenCalledOnce();
  });

  it('al fundirse el fusible cae al offline y NO llama a la API', async () => {
    const paid = paidStub();
    const { logger, records } = createMemoryLogger();
    const categorizer = new BudgetedCategorizer(
      paid,
      new OfflineCategorizer(),
      new DailyBudget(1),
      { logger },
    );

    await categorizer.analyze(mensaje); // consume el único crédito
    const segundo = await categorizer.analyze(mensaje);

    expect(paid.analyze).toHaveBeenCalledOnce();
    expect(segundo.categoria).toBe('tarea'); // resultado del heurístico offline
    expect(records.find((r) => r.event === 'cost.budget_exhausted')).toMatchObject({
      level: 'warn',
      used: 1,
      max: 1,
      action: 'fallback_offline',
    });
  });

  it('nunca lanza por motivos de coste: degrada, no rompe', async () => {
    const categorizer = new BudgetedCategorizer(
      paidStub(),
      new OfflineCategorizer(),
      new DailyBudget(0),
    );
    await expect(categorizer.analyze(mensaje)).resolves.toHaveProperty('categoria');
  });
});
