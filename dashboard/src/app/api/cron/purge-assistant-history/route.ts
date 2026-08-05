import { purgeOldExchanges } from "@/lib/assistantHistory";
import { purgeOldRateLimitBuckets } from "@/lib/rateLimit";

export const maxDuration = 30;

/**
 * Llamada por el Cron Job semanal de Vercel (ver dashboard/vercel.json):
 * borra el historial del Asistente de más de 7 días. Fuera del matcher de
 * proxy.ts (como el resto de rutas de API) — Vercel Cron no manda la cookie
 * de sesión del dashboard, así que la protección es CRON_SECRET, no login.
 *
 * También purga las ventanas de rate limiting ya expiradas (ver
 * rateLimit.ts): se reutiliza este mismo cron semanal en vez de crear uno
 * nuevo solo para eso — es limpieza de la misma naturaleza (tablas que
 * crecen con el tiempo y necesitan vaciarse solas), y añadir un Cron Job
 * nuevo implicaría tocar vercel.json y un endpoint más que proteger.
 *
 * Si CRON_SECRET está configurada, Vercel manda automáticamente
 * `Authorization: Bearer <CRON_SECRET>` en sus propias invocaciones — así
 * que exigirla aquí evita que cualquiera que adivine la ruta pueda disparar
 * el borrado. Sin CRON_SECRET configurada (p. ej. en local) se deja pasar:
 * solo borra historial de chat y ventanas de rate limit, no las notas del
 * usuario.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const deleted = await purgeOldExchanges();

  // No crítico: si esto falla, el cron ya hizo lo importante (purgar el
  // historial) — un fallo aquí solo deja alguna ventana vieja sin borrar.
  let rateLimitBucketsDeleted = 0;
  try {
    rateLimitBucketsDeleted = await purgeOldRateLimitBuckets();
  } catch (err) {
    console.error("No se pudieron purgar las ventanas de rate limit (no crítico):", err);
  }

  return Response.json({ deleted, rateLimitBucketsDeleted });
}
