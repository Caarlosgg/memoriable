import { purgeOldExchanges } from "@/lib/assistantHistory";

export const maxDuration = 30;

/**
 * Llamada por el Cron Job semanal de Vercel (ver dashboard/vercel.json):
 * borra el historial del Asistente de más de 7 días. Fuera del matcher de
 * proxy.ts (como el resto de rutas de API) — Vercel Cron no manda la cookie
 * de sesión del dashboard, así que la protección es CRON_SECRET, no login.
 *
 * Si CRON_SECRET está configurada, Vercel manda automáticamente
 * `Authorization: Bearer <CRON_SECRET>` en sus propias invocaciones — así
 * que exigirla aquí evita que cualquiera que adivine la ruta pueda disparar
 * el borrado. Sin CRON_SECRET configurada (p. ej. en local) se deja pasar:
 * solo borra historial de chat, no las notas del usuario.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const deleted = await purgeOldExchanges();
  return Response.json({ deleted });
}
