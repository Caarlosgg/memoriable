import { readFileSync, writeFileSync } from 'node:fs';

/** Ruta por defecto de la marca del último resumen enviado. Está en .gitignore. */
export const DEFAULT_SUMMARY_STATE_FILE = '.daily-summary.json';

/**
 * Marca persistente del último día en que se envió el resumen diario. Permite
 * que la idempotencia sobreviva a reinicios del proceso: si el bot se reinicia
 * el mismo día, no se reenvía.
 */
/**
 * `subject` es de quién es la marca (un userId).
 *
 * Era una sola marca para TODO el proceso, y eso hacía que el resumen diario
 * funcionara para exactamente una persona: el primer envío del día marcaba
 * "ya enviado" y bloqueaba el de todos los demás. Con varios usuarios
 * vinculados, solo uno recibía su resumen — y siempre el mismo.
 */
export interface SummaryStateStore {
  /** Clave de día (YYYY-MM-DD) del último envío a `subject`, o `undefined` si nunca. */
  lastSentDay(subject?: string): string | undefined;
  /** Marca `day` como el último día enviado a `subject`. */
  markSent(day: string, subject?: string): void;
}

/** Store en memoria (tests / cuando no interesa persistir). */
export class InMemorySummaryStateStore implements SummaryStateStore {
  private readonly days = new Map<string, string>();

  constructor(day?: string) {
    if (day) this.days.set('', day);
  }

  lastSentDay(subject?: string): string | undefined {
    return this.days.get(subject ?? '');
  }

  markSent(day: string, subject?: string): void {
    this.days.set(subject ?? '', day);
  }
}

/**
 * Store respaldado por un fichero JSON con UNA MARCA POR USUARIO:
 * `{ "<userId>": "YYYY-MM-DD" }`.
 *
 * El formato antiguo (`{ "lastSentDay": "..." }`) se lee como la marca
 * global, así que actualizar no provoca un reenvío el día del despliegue.
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

  private readAll(): Record<string, string> {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) return {};

      const entradas = parsed as Record<string, unknown>;
      // Formato antiguo: una marca suelta para todo el proceso.
      if (typeof entradas.lastSentDay === 'string') return { '': entradas.lastSentDay };

      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(entradas)) {
        if (typeof value === 'string') out[key] = value;
      }
      return out;
    } catch (err) {
      // Primer arranque sin fichero: caso normal, no se reporta.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') this.onError(err);
      return {};
    }
  }

  lastSentDay(subject?: string): string | undefined {
    return this.readAll()[subject ?? ''];
  }

  markSent(day: string, subject?: string): void {
    try {
      const all = this.readAll();
      all[subject ?? ''] = day;
      // Se tiran las marcas de días pasados: sin esto el fichero crecería
      // con una entrada por usuario que alguna vez recibió un resumen, y
      // ninguna volvería a consultarse (solo interesa "¿ya se envió HOY?").
      for (const [key, value] of Object.entries(all)) {
        if (value !== day) delete all[key];
      }
      writeFileSync(this.path, JSON.stringify(all), 'utf8');
    } catch (err) {
      this.onError(err);
    }
  }
}
