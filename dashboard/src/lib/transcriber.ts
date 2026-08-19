import "server-only";
import Groq from "groq-sdk";

/**
 * Transcripción de voz PROPIA del dashboard — deliberadamente NO es una
 * copia sincronizada de `../../../../src/ai/transcriber.ts` (a diferencia
 * del resto de `lib/botPipeline/`, ver su README). Dos motivos, verificados
 * antes de escribir esto:
 *
 * 1. El transcriptor del bot recibe una URL PÚBLICA (`create({ url })`)
 *    porque Telegram se la da y Groq la descarga él mismo. Aquí el audio
 *    sale de `MediaRecorder` en el navegador — un `Blob`, sin URL — así que
 *    hace falta la otra mitad de la misma API: `create({ file })`.
 * 2. Importar código del bot está cerrado de facto: usa
 *    `moduleResolution: nodenext` y el dashboard `bundler`; Turbopack rompe
 *    al cruzar ese límite (por eso existe `botPipeline/` como copia, no
 *    como import).
 *
 * Lo que SÍ se reutiliza del bot: el modelo, `language: "es"`, y el
 * criterio de "sin GROQ_API_KEY, la función no está disponible y la
 * interfaz ni la ofrece" — mismo espíritu que `isBlobConfigured()`.
 *
 * `Uploadable` (el tipo que pide `file`) acepta un `File` de la Web API tal
 * cual (`Uploadable = File | Response | FsReadStream | BunFile`, ver
 * node_modules/groq-sdk/internal/uploads.d.ts) — el propio `File` que
 * devuelve `request.formData().get("audio")` en el Route Handler, sin
 * convertir nada por el camino.
 */
const MODEL = "whisper-large-v3-turbo";

export function isVoiceConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

let client: Groq | undefined;
function groqClient(): Groq {
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

/**
 * Transcribe un fichero de audio a texto. `null` (nunca lanza) si falla o
 * si no hay nada que transcribir — el llamante decide el mensaje de error,
 * igual que `GroqTranscriber` en el bot.
 */
export async function transcribeAudio(file: File): Promise<string | null> {
  if (!isVoiceConfigured()) return null;
  try {
    const result = await groqClient().audio.transcriptions.create({
      file,
      model: MODEL,
      language: "es",
      response_format: "json",
    });
    const text = result.text?.trim();
    return text || null;
  } catch (err) {
    console.error("No se pudo transcribir el audio:", err);
    return null;
  }
}
