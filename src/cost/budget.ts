/**
 * Fusible de coste: limita cuántas llamadas de pago (API de Groq) se
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

/**
 * Almacén del contador. Inyectable para persistirlo entre reinicios.
 *
 * `subject` es de quién es el contador (un userId). Fundir el fusible es un
 * evento POR PERSONA: con un contador único para todo el proceso, el usuario
 * más activo dejaba a los demás sin categorización de pago el resto del día,
 * y ninguno de ellos había hecho nada.
 *
 * `undefined` = el contador global de siempre, que sigue existiendo para los
 * consumos que no son de nadie en concreto (el resumen diario programado).
 */
export interface BudgetStore {
  load(subject?: string): Promise<BudgetState | null>;
  save(state: BudgetState, subject?: string): Promise<void>;
}

export interface BudgetGuard {
  /** Reserva una llamada para `subject`. `false` si su fusible está fundido hoy. */
  tryConsume(subject?: string): Promise<boolean>;
  snapshot(subject?: string): Promise<BudgetSnapshot>;
}

/** Almacén en memoria (se reinicia con el proceso). */
export class InMemoryBudgetStore implements BudgetStore {
  private readonly states = new Map<string, BudgetState>();

  async load(subject?: string): Promise<BudgetState | null> {
    const state = this.states.get(subject ?? '');
    return state ? { ...state } : null;
  }

  async save(state: BudgetState, subject?: string): Promise<void> {
    this.states.set(subject ?? '', { ...state });
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

  private async current(subject?: string): Promise<BudgetState> {
    const today = utcDay(this.now());
    const stored = await this.store.load(subject);
    if (!stored || stored.day !== today) return { day: today, used: 0 };
    return stored;
  }

  async tryConsume(subject?: string): Promise<boolean> {
    const state = await this.current(subject);
    if (state.used >= this.max) {
      await this.store.save(state, subject);
      return false;
    }
    const next: BudgetState = { day: state.day, used: state.used + 1 };
    await this.store.save(next, subject);
    return true;
  }

  async snapshot(subject?: string): Promise<BudgetSnapshot> {
    const state = await this.current(subject);
    const remaining = Math.max(0, this.max - state.used);
    return { ...state, max: this.max, remaining, exhausted: remaining === 0 };
  }
}
