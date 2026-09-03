import { readFileSync, writeFileSync } from 'node:fs';
import type { BudgetState, BudgetStore } from './budget.js';

/** Ruta por defecto del contador persistido. Está en .gitignore. */
export const DEFAULT_BUDGET_FILE = '.budget.json';

/** Clave del contador global (consumos que no son de ningún usuario concreto). */
const GLOBAL_KEY = '';

/** Forma del fichero: un contador por sujeto. */
type BudgetFile = Record<string, BudgetState>;

function isBudgetState(value: unknown): value is BudgetState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BudgetState).day === 'string' &&
    Number.isFinite((value as BudgetState).used)
  );
}

/**
 * Almacén del fusible respaldado por un fichero JSON, para que el contador
 * sobreviva a reinicios del proceso. Justificación: un bug que provoque un
 * crash-loop reiniciaría un contador en memoria en cada vuelta y el fusible no
 * protegería de nada.
 *
 * Un contador POR USUARIO (ver `BudgetStore.subject`): con uno solo, el
 * usuario más activo fundía el fusible para todos los demás.
 *
 * Formato: `{ "<userId>": {day, used}, "": {day, used} }`. Los ficheros del
 * formato antiguo (`{day, used}` a pelo) se leen como el contador global, así
 * que actualizar no pierde la cuenta del día en curso ni obliga a borrar
 * nada a mano.
 *
 * Falla en silencio a propósito (registrando via callback opcional): un
 * problema de disco nunca debe tumbar el procesamiento de mensajes.
 */
export class FileBudgetStore implements BudgetStore {
  constructor(
    private readonly path: string = DEFAULT_BUDGET_FILE,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  private readAll(): BudgetFile {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      // Formato antiguo (un único contador suelto): se adopta como global.
      if (isBudgetState(parsed)) return { [GLOBAL_KEY]: parsed };
      if (typeof parsed !== 'object' || parsed === null) return {};

      const out: BudgetFile = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (isBudgetState(value)) out[key] = { day: value.day, used: value.used };
      }
      return out;
    } catch (err) {
      // Fichero inexistente en el primer arranque: caso normal, no se reporta.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') this.onError(err);
      return {};
    }
  }

  load(subject?: string): BudgetState | null {
    return this.readAll()[subject ?? GLOBAL_KEY] ?? null;
  }

  save(state: BudgetState, subject?: string): void {
    try {
      const all = this.readAll();
      all[subject ?? GLOBAL_KEY] = state;
      // Se tiran los contadores de días pasados al escribir: sin esto, el
      // fichero crecería sin límite con una entrada por usuario que alguna
      // vez usó el bot, y ninguna de ellas volvería a consultarse nunca.
      const hoy = state.day;
      for (const [key, value] of Object.entries(all)) {
        if (value.day !== hoy) delete all[key];
      }
      writeFileSync(this.path, JSON.stringify(all), 'utf8');
    } catch (err) {
      this.onError(err);
    }
  }
}
