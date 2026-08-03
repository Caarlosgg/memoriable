// Subconjunto sincronizado de ../../../../src/logging/logger.ts: solo el
// tipo `Logger` y `errorContext`, que es lo único que necesita
// resilientCategorizer.ts aquí. Ver botPipeline/README.md.

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

/**
 * Serializa un error para incluirlo como contexto de log sin perder
 * información ni volcar objetos no serializables.
 */
export function errorContext(err: unknown): LogContext {
  if (err instanceof Error) {
    const context: LogContext = { errorName: err.name, errorMessage: err.message };
    // Los errores de la SDK de Groq llevan código/estado HTTP.
    const withStatus = err as Error & { status?: unknown; code?: unknown };
    if (withStatus.status !== undefined) context.errorStatus = withStatus.status;
    if (withStatus.code !== undefined) context.errorCode = withStatus.code;
    return context;
  }
  return { errorName: 'UnknownError', errorMessage: String(err) };
}
