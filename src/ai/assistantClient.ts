import { env } from '../config/env.js';
import { errorContext, logger as rootLogger, type Logger } from '../logging/index.js';

/**
 * Cliente del Asistente que vive en el dashboard.
 *
 * El bot no puede ejecutar el Asistente por su cuenta: sus 17 herramientas
 * están escritas en el dashboard y los dos proyectos usan convenciones de
 * resolución de módulos incompatibles (ver `dashboard/src/lib/botPipeline/
 * README.md`). Así que se le pregunta por HTTP, con un secreto compartido.
 *
 * Interfaz mínima, mismo criterio que Categorizer/Transcriber/ImageReader:
 * se puede sustituir por un doble en tests sin tocar la red.
 */
export interface AssistantClient {
  /** `null` si no se ha podido obtener respuesta; el llamante avisa al usuario. */
  ask(params: {
    userId: string;
    pregunta: string;
    workspaceId: string;
    isPersonal: boolean;
    role: string;
  }): Promise<string | null>;
}

/**
 * Cuánto se espera al dashboard antes de rendirse.
 *
 * Por debajo del `maxDuration: 60` de la ruta: rendirse ANTES que el
 * servidor evita el peor caso, que es dejar al usuario mirando el chat
 * mientras la respuesta sí llega pero ya no la lee nadie. 55s deja margen
 * para el viaje de red sin pasarse del presupuesto del servidor.
 */
const TIMEOUT_MS = 55_000;

export class HttpAssistantClient implements AssistantClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly logger: Logger = rootLogger,
  ) {}

  async ask(params: {
    userId: string;
    pregunta: string;
    workspaceId: string;
    isPersonal: boolean;
    role: string;
  }): Promise<string | null> {
    // `AbortSignal.timeout` y no un setTimeout a mano: sin esto, una
    // respuesta que nunca llega deja la petición colgada para siempre y el
    // usuario sin ninguna respuesta, ni buena ni mala.
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/bot/asistente`, {
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
        // El mensaje del servidor SÍ se devuelve cuando es del propio
        // producto (límite diario alcanzado, Asistente sin configurar): es
        // información útil para el usuario, no un detalle interno.
        const error = (body as { error?: unknown } | null)?.error;
        this.logger.warn('assistant_client.rejected', { status: res.status });
        return typeof error === 'string' && res.status !== 500 ? error : null;
      }

      const respuesta = (body as { respuesta?: unknown } | null)?.respuesta;
      return typeof respuesta === 'string' && respuesta.trim() ? respuesta : null;
    } catch (err) {
      this.logger.error('assistant_client.failed', errorContext(err));
      return null;
    }
  }
}

/** Sin `DASHBOARD_URL` o sin `BOT_API_SECRET`: el bot avisa de que no puede preguntar, en vez de fallar en silencio. */
export class NullAssistantClient implements AssistantClient {
  async ask(): Promise<string | null> {
    return null;
  }
}

/**
 * Construye el cliente según el entorno. Hacen falta LAS DOS variables: sin
 * secreto no hay forma de autenticarse, y sin URL no hay a dónde llamar.
 */
export function resolveAssistantClient(logger: Logger = rootLogger): AssistantClient {
  if (!env.DASHBOARD_URL || !env.BOT_API_SECRET) return new NullAssistantClient();
  return new HttpAssistantClient(env.DASHBOARD_URL, env.BOT_API_SECRET, logger);
}
