import { readFileSync, writeFileSync } from 'node:fs';
import type { BudgetState, BudgetStore } from './budget.js';

/** Ruta por defecto del contador persistido. Está en .gitignore. */
export const DEFAULT_BUDGET_FILE = '.budget.json';

/**
 * Almacén del fusible respaldado por un fichero JSON, para que el contador
 * sobreviva a reinicios del proceso. Justificación: un bug que provoque un
 * crash-loop reiniciaría un contador en memoria en cada vuelta y el fusible no
 * protegería de nada.
 *
 * Falla en silencio a propósito (registrando via callback opcional): un
 * problema de disco nunca debe tumbar el procesamiento de mensajes.
 */
export class FileBudgetStore implements BudgetStore {
  constructor(
    private readonly path: string = DEFAULT_BUDGET_FILE,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  load(): BudgetState | null {
    try {
      const raw = readFileSync(this.path, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as BudgetState).day === 'string' &&
        Number.isFinite((parsed as BudgetState).used)
      ) {
        return { day: (parsed as BudgetState).day, used: (parsed as BudgetState).used };
      }
      return null;
    } catch (err) {
      // Fichero inexistente en el primer arranque: caso normal, no se reporta.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') this.onError(err);
      return null;
    }
  }

  save(state: BudgetState): void {
    try {
      writeFileSync(this.path, JSON.stringify(state), 'utf8');
    } catch (err) {
      this.onError(err);
    }
  }
}
