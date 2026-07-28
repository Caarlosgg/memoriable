/**
 * Logging estructurado en JSON (una línea por evento).
 *
 * Cada registro lleva `ts`, `level`, `event` y el contexto que se le pase, de
 * modo que se puede filtrar y depurar sin reproducir el problema. Nada de
 * `console.log` suelto por el código.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogContext = Record<string, unknown>;

export interface LogRecord extends LogContext {
  ts: string;
  level: LogLevel;
  event: string;
}

/** Destino de los registros. Inyectable para poder capturarlos en tests. */
export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  /** Crea un logger hijo que añade contexto fijo a todos sus registros. */
  child(context: LogContext): Logger;
}

export interface LoggerOptions {
  /** Nivel mínimo a emitir. Por defecto `info`. */
  level?: LogLevel;
  /** Destino. Por defecto, JSON por consola (stderr para warn/error). */
  sink?: LogSink;
  /** Contexto fijo añadido a cada registro. */
  base?: LogContext;
  /** Reloj inyectable (facilita tests deterministas). */
  now?: () => Date;
}

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && value in LEVEL_ORDER;
}

/** Normaliza el nivel recibido (p.ej. de LOG_LEVEL) o cae a `info`. */
export function normalizeLevel(value: unknown, fallback: LogLevel = 'info'): LogLevel {
  if (isLogLevel(value)) return value;
  const lowered = typeof value === 'string' ? value.toLowerCase() : undefined;
  return isLogLevel(lowered) ? lowered : fallback;
}

/** Sink por defecto: una línea JSON; warn/error van a stderr. */
export const consoleSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  if (record.level === 'error' || record.level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const sink = options.sink ?? consoleSink;
  const base = options.base ?? {};
  const now = options.now ?? (() => new Date());
  const threshold = LEVEL_ORDER[level];

  function emit(recordLevel: LogLevel, event: string, context?: LogContext): void {
    if (LEVEL_ORDER[recordLevel] < threshold) return;
    sink({
      ts: now().toISOString(),
      level: recordLevel,
      event,
      ...base,
      ...context,
    });
  }

  return {
    debug: (event, context) => emit('debug', event, context),
    info: (event, context) => emit('info', event, context),
    warn: (event, context) => emit('warn', event, context),
    error: (event, context) => emit('error', event, context),
    child: (context) => createLogger({ ...options, level, sink, now, base: { ...base, ...context } }),
  };
}

/**
 * Serializa un error para incluirlo como contexto de log sin perder
 * información ni volcar objetos no serializables.
 */
export function errorContext(err: unknown): LogContext {
  if (err instanceof Error) {
    const context: LogContext = { errorName: err.name, errorMessage: err.message };
    // Los errores de la SDK de Groq y de Telegram llevan código/estado HTTP.
    const withStatus = err as Error & { status?: unknown; code?: unknown };
    if (withStatus.status !== undefined) context.errorStatus = withStatus.status;
    if (withStatus.code !== undefined) context.errorCode = withStatus.code;
    return context;
  }
  return { errorName: 'UnknownError', errorMessage: String(err) };
}

/**
 * Logger de test: acumula los registros en memoria en vez de escribirlos.
 * Emite desde `debug` para poder asertar sobre cualquier evento.
 */
export function createMemoryLogger(level: LogLevel = 'debug'): {
  logger: Logger;
  records: LogRecord[];
} {
  const records: LogRecord[] = [];
  const logger = createLogger({ level, sink: (record) => records.push(record) });
  return { logger, records };
}
