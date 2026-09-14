import { env } from '../config/env.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';

/**
 * Cliente de `/api/bot/set-email` — mismo motivo y mismo patrón que
 * `assistantClient.ts`: la lógica (Prisma, envío de correo) vive en el
 * dashboard, así que se le pide por HTTP con el secreto compartido.
 */
export interface SetEmailResult {
  ok: boolean;
  /** Solo tiene sentido cuando `ok` es `true`: si el correo se guardó pero el envío falló (GMAIL_* sin configurar, SMTP caído). */
  enviado?: boolean;
  /** Mensaje de error en español, listo para mostrar, cuando `ok` es `false`. */
  error?: string;
}

export interface SetEmailClient {
  setEmail(params: { userId: string; email: string }): Promise<SetEmailResult>;
}

/** Igual que en assistantClient.ts: rendirse antes que el propio servidor evita dejar al usuario esperando una respuesta que ya no llega a tiempo. */
const TIMEOUT_MS = 20_000;

export class HttpSetEmailClient implements SetEmailClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly logger: Logger = rootLogger,
  ) {}

  async setEmail(params: { userId: string; email: string }): Promise<SetEmailResult> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/bot/set-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        this.logger.warn('set_email_client.rejected', { status: res.status });
        return { ok: false, error: typeof error === 'string' ? error : undefined };
      }

      const enviado = (body as { enviado?: unknown } | null)?.enviado;
      return { ok: true, enviado: enviado !== false };
    } catch (err) {
      this.logger.error('set_email_client.failed', errorContext(err));
      return { ok: false };
    }
  }
}

/** Sin `DASHBOARD_URL` o sin `BOT_API_SECRET`: el bot avisa de que no puede hacerlo, en vez de fallar en silencio. */
export class NullSetEmailClient implements SetEmailClient {
  async setEmail(): Promise<SetEmailResult> {
    return { ok: false };
  }
}

export function resolveSetEmailClient(logger: Logger = rootLogger): SetEmailClient {
  if (!env.DASHBOARD_URL || !env.BOT_API_SECRET) return new NullSetEmailClient();
  return new HttpSetEmailClient(env.DASHBOARD_URL, env.BOT_API_SECRET, logger);
}
