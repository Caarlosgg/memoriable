import "server-only";
import { headers } from "next/headers";

/**
 * Limitador de peticiones en memoria (ventana fija). Freno de fuerza bruta
 * para login/registro: barato y sin dependencias nuevas.
 *
 * AVISO DE ALCANCE: en Vercel (serverless) el estado vive en la memoria de
 * CADA instancia caliente, no se comparte entre instancias ni sobrevive a un
 * arranque en frío. Es best-effort: frena ráfagas contra una misma instancia
 * caliente, que es el caso común, pero NO es un límite distribuido robusto.
 * Un limitador de verdad necesita un store compartido (Upstash/Redis o una
 * tabla en BD) — documentado como pendiente porque toca infra/esquema.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Evita que el Map crezca sin límite: purga las ventanas ya expiradas. */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos hasta que la ventana se reinicia (solo relevante si !allowed). */
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 5000) sweep(now); // cota de seguridad ante muchas claves distintas

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * IP del cliente a partir de las cabeceras que pone Vercel. Cae a "unknown"
 * si no hay ninguna (p. ej. en local) — ahí el límite agrupa a todos bajo
 * una misma clave, aceptable para desarrollo.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}
