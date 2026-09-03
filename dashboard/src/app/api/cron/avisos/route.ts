import * as Sentry from "@sentry/nextjs";
import { enviarAvisosDeVencimiento } from "@/lib/avisosVencimiento";

export const maxDuration = 60;

/**
 * Cron diario que avisa de lo que vence hoy o mañana (ver vercel.json).
 *
 * Es lo que convierte "recordatorio" en una categoría que significa algo:
 * hasta ahora se podía clasificar un mensaje como recordatorio, ponerle
 * fecha y no pasaba absolutamente nada nunca.
 *
 * Protección por `CRON_SECRET`, igual que el cron de purga: Vercel manda
 * `Authorization: Bearer <CRON_SECRET>` en sus propias invocaciones, y esto
 * evita que cualquiera que adivine la ruta pueda disparar una tanda de
 * notificaciones a todos los usuarios. Sin la variable configurada (local)
 * se deja pasar: solo crea notificaciones, no toca ni borra datos.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  try {
    const resultado = await enviarAvisosDeVencimiento();
    return Response.json(resultado);
  } catch (err) {
    console.error("Fallo al mandar los avisos de vencimiento:", err);
    Sentry.captureException(err);
    return Response.json({ error: "No se pudieron enviar los avisos." }, { status: 500 });
  }
}
