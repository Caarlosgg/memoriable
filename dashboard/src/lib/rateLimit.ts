import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";

/**
 * Rate limiting distribuido (ventana fija), respaldado en Postgres — mismo
 * patrón de upsert atómico que el fusible del Asistente
 * (`tryConsumeAssistantBudget` en assistantBudget.ts), pero con ventana de
 * tiempo en vez de por día. Reemplaza al limitador en memoria que había
 * antes: en Vercel (serverless) ese estado vivía en la memoria de CADA
 * instancia caliente — no se compartía entre instancias ni sobrevivía a un
 * arranque en frío. Esta tabla sí es la misma para todas las instancias.
 *
 * Fail-open: si la comprobación falla (BD caída, timeout), se deja pasar la
 * petición en vez de bloquear un login legítimo — un rate limiter roto
 * nunca debe convertirse en una forma de dejar a la gente fuera.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Segundos hasta que la ventana se reinicia (solo relevante si !allowed). */
  retryAfterSeconds: number;
}

export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);

  try {
    const bucket = await prisma.rateLimitBucket.upsert({
      where: { bucketKey_windowStart: { bucketKey: key, windowStart } },
      create: { bucketKey: key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (bucket.count > limit) {
      const retryAfterSeconds = Math.ceil((windowStartMs + windowMs - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.error("Rate limiter (BD) falló, se deja pasar la petición:", err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * Borra ventanas ya muy expiradas. Las ventanas de login/registro duran
 * como mucho 15 minutos, así que cualquier cosa de hace más de un día es
 * pura basura — la llama el mismo Cron Job semanal que purga el historial
 * del Asistente (ver purgeOldExchanges en assistantHistory.ts).
 */
export async function purgeOldRateLimitBuckets(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return count;
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
