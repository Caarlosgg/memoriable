/**
 * Clasificación de errores de la API de Telegram, para poder reaccionar y
 * registrar con un mensaje útil en vez de un volcado opaco.
 */

export interface TelegramErrorInfo {
  /** `true` si reintentar no va a arreglar nada (hace falta intervención). */
  fatal: boolean;
  /** Evento de log asociado. */
  event: string;
  /** Explicación accionable para el operador. */
  hint: string;
}

function statusOf(err: unknown): number | undefined {
  const candidate = err as { response?: { error_code?: unknown }; code?: unknown } | null;
  const fromResponse = candidate?.response?.error_code;
  if (typeof fromResponse === 'number') return fromResponse;
  if (typeof candidate?.code === 'number') return candidate.code;
  return undefined;
}

/** Traduce un error de Telegram a algo accionable. */
export function describeTelegramError(err: unknown): TelegramErrorInfo {
  const status = statusOf(err);
  const message = err instanceof Error ? err.message : String(err);

  if (status === 401 || /unauthorized/i.test(message)) {
    return {
      fatal: true,
      event: 'telegram.invalid_token',
      hint:
        'Telegram rechaza el token (401 Unauthorized). Revisa TELEGRAM_BOT_TOKEN en .env: ' +
        'debe ser el token completo que da @BotFather, con el formato 123456789:AA...',
    };
  }

  if (status === 404) {
    return {
      fatal: true,
      event: 'telegram.not_found',
      hint: 'Telegram devuelve 404: el token probablemente está mal formado o el bot fue borrado.',
    };
  }

  if (status === 409) {
    return {
      fatal: false,
      event: 'telegram.conflict',
      hint:
        'Otra instancia del bot está haciendo polling con el mismo token (409 Conflict). ' +
        'Cierra la otra instancia; se reintenta por si es un despliegue solapándose.',
    };
  }

  if (status === 429) {
    return {
      fatal: false,
      event: 'telegram.rate_limited',
      hint: 'Telegram está limitando la tasa de peticiones (429). Se reintenta con espera mayor.',
    };
  }

  return {
    fatal: false,
    event: 'telegram.network_error',
    hint: 'Fallo de red o error temporal de la API de Telegram. Se reintenta con backoff.',
  };
}

/** Formato de token de BotFather: `<id numérico>:<secreto>`. */
export function isValidTokenFormat(token: string | undefined): boolean {
  if (!token) return false;
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token.trim());
}
