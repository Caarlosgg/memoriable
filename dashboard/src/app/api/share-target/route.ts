import * as Sentry from "@sentry/nextjs";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, canWrite } from "@/lib/workspace";
import { captureMessage } from "@/lib/pipeline";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Mismo cubo (`capture:<userId>`) y límite que `capture()`/
 * `crearTareaEnColumna()` en actions.ts: es la misma acción real
 * (categorizar+resumir con IA) por una tercera vía, así que comparte
 * contador en vez de que alternar entre las tres lo esquive.
 */
const CAPTURE_LIMIT = 60;
const CAPTURE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Recibe lo compartido desde OTRA app del sistema (Android: botón
 * "Compartir" → MemorIAble, ver `share_target` en `manifest.ts`).
 *
 * No es una Server Action ni una API JSON: el sistema operativo navega el
 * navegador aquí con una petición POST real (`multipart/form-data`), igual
 * que si se hubiera enviado un formulario — la respuesta tiene que ser una
 * redirección real, no un JSON, o el usuario se queda mirando una pantalla
 * en blanco tras compartir.
 *
 * Mismo camino que la captura normal del dashboard (`capture` en
 * actions.ts): `verifySession` (redirige solo a /login si no hay sesión —
 * gratis, es lo mismo que hace por dentro), workspace activo, mismo
 * `captureMessage`. Ninguna superficie de captura nueva, solo una entrada
 * más al mismo sitio de siempre.
 */
export async function POST(req: Request): Promise<Response> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);

  const base = new URL(req.url).origin;
  if (!canWrite(role)) {
    // Sin manera limpia de explicar por qué en mitad de una navegación de
    // compartir del sistema — se descarta en silencio, mismo criterio que
    // cualquier otro intento de escritura sin permiso.
    return Response.redirect(`${base}/notas`, 303);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.redirect(`${base}/notas`, 303);
  }

  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  // Deduplicado: muchas apps mandan la misma URL en `text` Y en `url` (o el
  // mismo texto en `title` y `text`) — sin esto, compartir un enlace de
  // Chrome guardaba la URL dos veces seguidas.
  const contenido = [...new Set([title, text, url].filter(Boolean))].join("\n\n");
  if (!contenido) return Response.redirect(`${base}/notas`, 303);

  // Sin manera limpia de explicar el motivo en mitad de una navegación de
  // compartir del sistema (mismo criterio que el rol de solo lectura arriba)
  // — se descarta en silencio en vez de guardar sin límite.
  const limite = await checkRateLimit(`capture:${userId}`, CAPTURE_LIMIT, CAPTURE_WINDOW_MS);
  if (!limite.allowed) return Response.redirect(`${base}/notas`, 303);

  try {
    const saved = await captureMessage(userId, contenido, workspaceId);
    return Response.redirect(`${base}/notas?mensaje=${saved.id}`, 303);
  } catch (err) {
    console.error("Error al capturar mensaje compartido desde otra app:", err);
    Sentry.captureException(err);
    return Response.redirect(`${base}/notas`, 303);
  }
}
