import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Comprueba el secreto compartido que autentica al bot de Telegram frente a
 * las rutas `/api/bot/*` (no hay cookie de sesión: quien llama es un
 * proceso, no un navegador). Extraído de `api/bot/asistente/route.ts` al
 * añadir una segunda ruta bot→dashboard (`set-email`) — dos copias de una
 * comparación de secretos son exactamente el tipo de cosa que diverge en
 * silencio si se mantienen por separado.
 */
export function verifyBotSecret(req: Request): boolean {
  const secreto = process.env.BOT_API_SECRET;
  // Sin secreto configurado la ruta queda CERRADA, nunca abierta: un
  // despliegue al que se le olvide la variable no puede convertirse en un
  // endpoint público que actúa por cualquier userId que le pidan.
  if (!secreto) return false;

  const header = req.headers.get("authorization") ?? "";
  const enviado = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(enviado);
  const b = Buffer.from(secreto);
  // Comparación en tiempo constante: comparar con === filtra por tiempo
  // cuántos caracteres del secreto se han acertado.
  return a.length === b.length && timingSafeEqual(a, b);
}
