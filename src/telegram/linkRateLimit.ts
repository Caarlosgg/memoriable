/**
 * Freno de fuerza bruta para `/vincular`: el código es de solo 6 dígitos (1
 * millón de combinaciones). Sin límite de intentos, alguien podría mandar
 * códigos al azar hasta acertar el de una vinculación ACTIVA de otra
 * cuenta (no la suya) y quedarse con acceso a esas notas privadas — no
 * hace falta acertar el código de un objetivo concreto, cualquier código
 * vigente de cualquier usuario sirve.
 *
 * En memoria del propio proceso: el bot corre como un único proceso
 * Telegraf de polling de larga duración (no serverless), así que no hace
 * falta el patrón distribuido de `rateLimit.ts` del dashboard — el estado
 * vive mientras vive el proceso, que es justo la escala de tiempo que
 * importa aquí (la ventana es de minutos, igual que el propio código).
 */
export interface LinkAttemptLimiter {
  isBlocked(chatId: number): boolean;
  registerFailure(chatId: number): void;
  clear(chatId: number): void;
}

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export function createLinkAttemptLimiter(
  maxFailedAttempts = MAX_FAILED_ATTEMPTS,
  windowMs = WINDOW_MS,
): LinkAttemptLimiter {
  const buckets = new Map<number, { count: number; windowStart: number }>();

  function activeBucket(chatId: number) {
    const bucket = buckets.get(chatId);
    if (!bucket || Date.now() - bucket.windowStart > windowMs) return null;
    return bucket;
  }

  return {
    isBlocked(chatId) {
      const bucket = activeBucket(chatId);
      return bucket !== null && bucket.count >= maxFailedAttempts;
    },
    registerFailure(chatId) {
      const bucket = activeBucket(chatId);
      if (bucket) {
        bucket.count += 1;
      } else {
        buckets.set(chatId, { count: 1, windowStart: Date.now() });
      }
    },
    clear(chatId) {
      buckets.delete(chatId);
    },
  };
}

/** Instancia compartida que usa el bot real (ver `createBot` en `bot.ts`). */
export const linkAttemptLimiter = createLinkAttemptLimiter();
