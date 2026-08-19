import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { isSessionActive } from "@/lib/sessionRevocation";
import { transcribeAudio, isVoiceConfigured } from "@/lib/transcriber";

/**
 * Transcribe una nota de voz grabada en el navegador. Route Handler, no
 * Server Action a propósito: el límite de cuerpo de una Server Action es
 * global de la app (ver `serverActions.bodySizeLimit` en next.config.ts,
 * ahí para las imágenes), y un audio efímero de un solo uso no debería subir
 * ese límite para todo lo demás.
 *
 * Límite real a respetar — verificado, no de memoria: las Funciones de
 * Vercel (Route Handlers incluidos) tienen un tope de payload de 4.5 MB que
 * NO se puede subir desde código, es de la plataforma
 * (https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
 * Por eso el micrófono corta solo a los 60s (ver useAudioRecorder.ts): un
 * minuto de voz a los bitrates normales de Opus/AAC no se acerca ni de
 * lejos a ese tope, así que nunca hace falta que el usuario lo sepa. Aun
 * así, se rechaza aquí cualquier cosa por encima de un margen prudente —
 * mejor un mensaje claro que un 413 opaco de la plataforma.
 */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session || !(await isSessionActive(session.userId, session.issuedAt))) {
    return errorResponse("No autenticado", 401);
  }

  if (!isVoiceConfigured()) {
    return errorResponse("El dictado por voz no está configurado (falta GROQ_API_KEY).", 503);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("La petición no es válida.", 400);
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return errorResponse("No se ha recibido ningún audio.", 400);
  }
  if (!audio.type.startsWith("audio/")) {
    return errorResponse("El fichero no es un audio.", 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return errorResponse("La grabación es demasiado larga.", 413);
  }

  const texto = await transcribeAudio(audio);
  if (!texto) {
    return errorResponse("No se ha podido transcribir. Inténtalo de nuevo.", 502);
  }
  return Response.json({ texto });
}
