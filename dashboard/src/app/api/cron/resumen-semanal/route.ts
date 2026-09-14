import * as Sentry from "@sentry/nextjs";
import { enviarResumenSemanal } from "@/lib/weeklyDigest";
import { resolveBaseUrl } from "@/lib/email";

export const maxDuration = 60;

/**
 * Cron semanal (domingos, ver vercel.json): "cuánto has guardado, qué
 * vence pronto" — un correo pasivo que no depende de que abras la app.
 *
 * Mismo criterio de protección que los otros dos crons ya existentes
 * (avisos, purga del historial): `CRON_SECRET`, que Vercel manda solo,
 * evita que cualquiera que adivine la ruta dispare una tanda de correos a
 * toda la base de usuarios.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  try {
    const baseUrl = await resolveBaseUrl();
    const resultado = await enviarResumenSemanal(baseUrl);
    return Response.json(resultado);
  } catch (err) {
    console.error("Fallo al mandar el resumen semanal:", err);
    Sentry.captureException(err);
    return Response.json({ error: "No se pudo enviar el resumen semanal." }, { status: 500 });
  }
}
