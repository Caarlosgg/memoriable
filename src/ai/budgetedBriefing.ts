import type { BudgetGuard } from '../cost/budget.js';
import type { Logger } from '../logging/logger.js';
import type { BriefingGenerator, BriefingInput, BriefingResult } from './briefing.js';

export interface BudgetedBriefingGeneratorOptions {
  logger?: Logger;
}

/**
 * Aplica el mismo fusible de coste diario que ya protege la categorización
 * (`BudgetedCategorizer`) — comparte el propio `BudgetGuard` inyectado, no
 * un contador aparte: un briefing es, como mucho, unas pocas llamadas al
 * día (cron + /resumen + /hoy bajo demanda), no merece su propio límite
 * independiente ni una variable de entorno nueva.
 */
export class BudgetedBriefingGenerator implements BriefingGenerator {
  private readonly logger: Logger | undefined;

  constructor(
    private readonly paid: BriefingGenerator,
    private readonly fallback: BriefingGenerator,
    private readonly budget: BudgetGuard,
    options: BudgetedBriefingGeneratorOptions = {},
  ) {
    this.logger = options.logger;
  }

  async generate(input: BriefingInput): Promise<BriefingResult> {
    if (!this.budget.tryConsume()) {
      const { used, max, day } = this.budget.snapshot();
      this.logger?.warn('cost.budget_exhausted', {
        used,
        max,
        day,
        action: 'briefing_fallback_offline',
        hint: 'Sube MAX_MESSAGES_PER_DAY si esto es uso legítimo.',
      });
      return this.fallback.generate(input);
    }
    return this.paid.generate(input);
  }
}
