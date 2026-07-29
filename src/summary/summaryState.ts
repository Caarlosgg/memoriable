import { readFileSync, writeFileSync } from 'node:fs';

/** Ruta por defecto de la marca del último resumen enviado. Está en .gitignore. */
export const DEFAULT_SUMMARY_STATE_FILE = '.daily-summary.json';

/**
 * Marca persistente del último día en que se envió el resumen diario. Permite
 * que la idempotencia sobreviva a reinicios del proceso: si el bot se reinicia
 * el mismo día, no se reenvía.
 */
export interface SummaryStateStore {
  /** Clave de día (YYYY-MM-DD) del último envío, o `undefined` si nunca. */
  lastSentDay(): string | undefined;
  /** Marca `day` como el último día enviado. */
  markSent(day: string): void;
}

/** Store en memoria (tests / cuando no interesa persistir). */
export class InMemorySummaryStateStore implements SummaryStateStore {
  constructor(private day: string | undefined = undefined) {}
  lastSentDay(): string | undefined {
    return this.day;
  }
  markSent(day: string): void {
    this.day = day;
  }
}

/**
 * Store respaldado por un fichero JSON `{ "lastSentDay": "YYYY-MM-DD" }`.
 *
 * Falla en silencio a propósito (reportando por callback): un problema de disco
 * no debe tumbar el bot. En el peor caso se reenvía el resumen una vez de más,
 * que es preferible a un crash.
 */
export class FileSummaryStateStore implements SummaryStateStore {
  constructor(
    private readonly path: string = DEFAULT_SUMMARY_STATE_FILE,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  lastSentDay(): string | undefined {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as { lastSentDay?: unknown }).lastSentDay === 'string'
      ) {
        return (parsed as { lastSentDay: string }).lastSentDay;
      }
      return undefined;
    } catch (err) {
      // Primer arranque sin fichero: caso normal, no se reporta.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') this.onError(err);
      return undefined;
    }
  }

  markSent(day: string): void {
    try {
      writeFileSync(this.path, JSON.stringify({ lastSentDay: day }), 'utf8');
    } catch (err) {
      this.onError(err);
    }
  }
}
