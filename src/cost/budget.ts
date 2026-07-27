/**
 * Fusible de coste: limita cuántas llamadas de pago (API de Anthropic) se
 * pueden hacer por día.
 *
 * NO es lógica de facturación: es una protección ante bugs en bucle o uso
 * inesperado mientras no hay ningún plan de pago detrás. Al agotarse, el
 * sistema no falla: cae al categorizador offline y registra el evento.
 */

export interface BudgetState {
  /** Día en curso en formato YYYY-MM-DD (UTC). */
  day: string;
  /** Llamadas consumidas en ese día. */
  used: number;
}

export interface BudgetSnapshot extends BudgetState {
  max: number;
  remaining: number;
  exhausted: boolean;
}

/** Almacén del contador. Inyectable para persistirlo entre reinicios. */
export interface BudgetStore {
  load(): BudgetState | null;
  save(state: BudgetState): void;
}

export interface BudgetGuard {
  /** Reserva una llamada. `false` si el fusible está fundido para hoy. */
  tryConsume(): boolean;
  snapshot(): BudgetSnapshot;
}

/** Almacén en memoria (se reinicia con el proceso). */
export class InMemoryBudgetStore implements BudgetStore {
  private state: BudgetState | null = null;

  load(): BudgetState | null {
    return this.state ? { ...this.state } : null;
  }

  save(state: BudgetState): void {
    this.state = { ...state };
  }
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Presupuesto diario de llamadas, con reinicio automático al cambiar el día
 * (UTC).
 *
 * `max = 0` bloquea todas las llamadas de pago (modo totalmente offline). Se
 * elige este significado a propósito: ante un valor de 0 es más seguro no
 * gastar que interpretarlo como "ilimitado".
 */
export class DailyBudget implements BudgetGuard {
  constructor(
    private readonly max: number,
    private readonly store: BudgetStore = new InMemoryBudgetStore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private current(): BudgetState {
    const today = utcDay(this.now());
    const stored = this.store.load();
    if (!stored || stored.day !== today) return { day: today, used: 0 };
    return stored;
  }

  tryConsume(): boolean {
    const state = this.current();
    if (state.used >= this.max) {
      this.store.save(state);
      return false;
    }
    const next: BudgetState = { day: state.day, used: state.used + 1 };
    this.store.save(next);
    return true;
  }

  snapshot(): BudgetSnapshot {
    const state = this.current();
    const remaining = Math.max(0, this.max - state.used);
    return { ...state, max: this.max, remaining, exhausted: remaining === 0 };
  }
}
