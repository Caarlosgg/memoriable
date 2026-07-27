import type { BudgetGuard } from '../cost/budget.js';
import type { Logger } from '../logging/logger.js';
import type { Analysis, Categorizer, IncomingMessage } from './types.js';

export interface BudgetedCategorizerOptions {
  logger?: Logger;
}

/**
 * Decorador que aplica el fusible de coste: mientras queden llamadas en el
 * presupuesto diario usa el categorizador de pago; al agotarse cae al
 * categorizador offline y lo registra.
 *
 * El servicio nunca se degrada a error por motivos de coste: se degrada a una
 * categorización peor, que es lo que interesa cuando no hay plan de pago.
 */
export class BudgetedCategorizer implements Categorizer {
  private readonly logger: Logger | undefined;

  constructor(
    private readonly paid: Categorizer,
    private readonly fallback: Categorizer,
    private readonly budget: BudgetGuard,
    options: BudgetedCategorizerOptions = {},
  ) {
    this.logger = options.logger;
  }

  async analyze(message: IncomingMessage): Promise<Analysis> {
    if (!this.budget.tryConsume()) {
      const { used, max, day } = this.budget.snapshot();
      this.logger?.warn('cost.budget_exhausted', {
        used,
        max,
        day,
        action: 'fallback_offline',
        hint: 'Sube MAX_MESSAGES_PER_DAY si esto es uso legítimo.',
      });
      return this.fallback.analyze(message);
    }

    const { remaining, max } = this.budget.snapshot();
    this.logger?.debug('cost.budget_consumed', { remaining, max });
    return this.paid.analyze(message);
  }
}
