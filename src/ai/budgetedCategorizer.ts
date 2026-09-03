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

  async analyze(message: IncomingMessage, userId?: string): Promise<Analysis> {
    // El fusible se lleva POR USUARIO: sin esto, quien más usa el bot
    // apagaba la categorización de pago para todos los demás.
    if (!this.budget.tryConsume(userId)) {
      const { used, max, day } = this.budget.snapshot(userId);
      this.logger?.warn('cost.budget_exhausted', {
        used,
        max,
        day,
        userId,
        action: 'fallback_offline',
        hint: 'Sube MAX_MESSAGES_PER_DAY si esto es uso legítimo.',
      });
      return this.fallback.analyze(message, userId);
    }

    const { remaining, max } = this.budget.snapshot(userId);
    this.logger?.debug('cost.budget_consumed', { remaining, max, userId });
    return this.paid.analyze(message, userId);
  }
}
