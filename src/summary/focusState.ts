import { readFileSync, writeFileSync } from 'node:fs';

/** Ruta por defecto del estado del foco del día. Está en .gitignore, igual que la marca de envío. */
export const DEFAULT_FOCUS_STATE_FILE = '.daily-focus.json';

export interface DailyFocus {
  /** Clave de día (YYYY-MM-DD) al que pertenece este foco. */
  day: string;
  /** ¿Sigue esperando que el usuario responda cuál es su foco de hoy? */
  awaitingAnswer: boolean;
  /** Lo que respondió, una vez contestado. */
  text?: string;
}

/**
 * Estado del "ritual matutino" (Tier 2.6): tras mandar el resumen con 2-3
 * candidatas, el bot espera UNA respuesta de texto y la marca como el foco
 * del día — en vez de guardarla como una nota más. Guardado por chat
 * (no por usuario): mismo alcance que `SummaryStateStore`, un solo chat
 * configurado (`TELEGRAM_CHAT_ID`) por ahora.
 */
export interface FocusStateStore {
  get(chatId: number): DailyFocus | undefined;
  setAwaiting(chatId: number, day: string): void;
  setAnswer(chatId: number, day: string, text: string): void;
}

export class InMemoryFocusStateStore implements FocusStateStore {
  private readonly byChat = new Map<number, DailyFocus>();

  get(chatId: number): DailyFocus | undefined {
    return this.byChat.get(chatId);
  }

  setAwaiting(chatId: number, day: string): void {
    this.byChat.set(chatId, { day, awaitingAnswer: true });
  }

  setAnswer(chatId: number, day: string, text: string): void {
    this.byChat.set(chatId, { day, awaitingAnswer: false, text });
  }
}

interface FocusFileShape {
  [chatId: string]: DailyFocus;
}

/**
 * Store respaldado por un fichero JSON `{ "<chatId>": { day, awaitingAnswer, text? } }`.
 * Falla en silencio a propósito (reportando por callback), igual que
 * `FileSummaryStateStore`: un problema de disco no debe tumbar el bot ni
 * bloquear la captura normal de mensajes.
 */
export class FileFocusStateStore implements FocusStateStore {
  constructor(
    private readonly path: string = DEFAULT_FOCUS_STATE_FILE,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  private readAll(): FocusFileShape {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      return typeof parsed === 'object' && parsed !== null ? (parsed as FocusFileShape) : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') this.onError(err);
      return {};
    }
  }

  private writeAll(data: FocusFileShape): void {
    try {
      writeFileSync(this.path, JSON.stringify(data), 'utf8');
    } catch (err) {
      this.onError(err);
    }
  }

  get(chatId: number): DailyFocus | undefined {
    return this.readAll()[String(chatId)];
  }

  setAwaiting(chatId: number, day: string): void {
    const all = this.readAll();
    all[String(chatId)] = { day, awaitingAnswer: true };
    this.writeAll(all);
  }

  setAnswer(chatId: number, day: string, text: string): void {
    const all = this.readAll();
    all[String(chatId)] = { day, awaitingAnswer: false, text };
    this.writeAll(all);
  }
}
