import { groq } from "@ai-sdk/groq";
import * as Sentry from "@sentry/nextjs";
import { generateText, stepCountIs } from "ai";
import { timingSafeEqual } from "node:crypto";
import { tryConsumeAssistantBudget } from "@/lib/assistantBudget";
import { prepararAsistente } from "@/lib/assistantRun";

/** Mismo presupuesto de tiempo que la ruta web: encadenar tools tarda. */
export const maxDuration = 60;

const DEFAULT_MAX_QUESTIONS_PER_DAY = 30;
const MAX_TOOL_STEPS = 8;

/**
 * Puerta de entrada del bot de Telegram al Asistente.
 *
 * Existe porque las 17 herramientas del Asistente viven aquí, en el
 * dashboard, y el bot **no puede importarlas**: los dos proyectos usan
 * convenciones de resolución de módulos incompatibles (ver
 * `lib/botPipeline/README.md`). Sin esta ruta, el bot tenía 17 herramientas
 * construidas y ninguna forma de llegar a ellas — se podía dictar al bot,
 * pero no preguntarle nada.
 *
 * Diferencias con `/api/asistente`, y solo estas:
 * - **Autenticación por secreto compartido**, no por cookie: el bot es un
 *   proceso, no un navegador. El `userId` viene en el cuerpo porque quien
 *   lo resuelve es el bot (por `telegramChatId`), y solo se acepta de un
 *   llamante que ya ha demostrado ser el bot.
 * - **Sin streaming**: Telegram no tiene mensajes que se van rellenando; se
 *   manda uno completo o nada.
 * - **Sin historial de conversación**: no hay hilos en Telegram, cada
 *   pregunta se responde por sí sola.
 *
 * El cerebro (contexto, prompt, herramientas) es EXACTAMENTE el mismo — ver
 * `prepararAsistente`. Que cada superficie montara el suyo es justo el error
 * que ya se pagó con `/buscar`.
 */
function autorizado(req: Request): boolean {
  const secreto = process.env.BOT_API_SECRET;
  // Sin secreto configurado la ruta queda CERRADA, nunca abierta: un
  // despliegue al que se le olvide la variable no puede convertirse en un
  // endpoint público que responde por cualquier userId que le pidan.
  if (!secreto) return false;

  const header = req.headers.get("authorization") ?? "";
  const enviado = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(enviado);
  const b = Buffer.from(secreto);
  // Comparación en tiempo constante: comparar con === filtra por tiempo
  // cuántos caracteres del secreto se han acertado.
  return a.length === b.length && timingSafeEqual(a, b);
}

interface BotAsistenteBody {
  userId?: string;
  pregunta?: string;
  /** Dónde trabaja el bot ahora mismo (ver `/espacio` y `resolveBotWorkspace`). */
  workspaceId?: string;
  isPersonal?: boolean;
  role?: string;
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "El Asistente no está configurado." }, { status: 503 });
  }

  let body: BotAsistenteBody;
  try {
    body = (await req.json()) as BotAsistenteBody;
  } catch {
    return Response.json({ error: "Petición no válida." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const pregunta = body.pregunta?.trim();
  const workspaceId = body.workspaceId?.trim();
  if (!userId || !pregunta || !workspaceId) {
    return Response.json({ error: "Faltan datos en la petición." }, { status: 400 });
  }

  // El mismo fusible por usuario que la web: preguntar desde Telegram no
  // puede ser una puerta trasera para saltarse el límite diario.
  const maxPerDay = Number(process.env.ASSISTANT_MAX_QUESTIONS_PER_DAY ?? DEFAULT_MAX_QUESTIONS_PER_DAY);
  try {
    if (!(await tryConsumeAssistantBudget(maxPerDay, userId))) {
      return Response.json(
        { error: "Has llegado al límite de preguntas de hoy. Vuelve mañana." },
        { status: 429 },
      );
    }
  } catch (err) {
    // Fail-open, igual que en la web: un fallo puntual al consultar el
    // contador no debe dejar a nadie sin Asistente.
    console.error("No se pudo comprobar el fusible del Asistente (se continúa):", err);
  }

  try {
    const { system, tools } = await prepararAsistente({
      userId,
      pregunta,
      workspaceId,
      isPersonal: body.isPersonal ?? true,
      // El rol lo manda el bot desde la membresía que ya ha resuelto; ante
      // cualquier valor raro se cae a VIEWER, que es el que MENOS puede
      // hacer — un rol dudoso nunca debe ampliar permisos.
      role: body.role === "OWNER" || body.role === "ADMIN" || body.role === "MEMBER" ? body.role : "VIEWER",
    });

    const { text, toolCalls } = await generateText({
      model: groq("openai/gpt-oss-120b"),
      system,
      prompt: pregunta,
      tools,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      providerOptions: { groq: { reasoningEffort: "medium", reasoningFormat: "hidden" } },
    });

    // Mismo caso que el `onFinish` de la ruta web: el turno puede haber
    // hecho algo (crear una nota, asignar una tarea) y cortarse antes de
    // redactar la confirmación. Responder vacío haría creer que no pasó nada.
    const respuesta = text.trim() || (toolCalls.length > 0 ? "Hecho — acción completada." : "");
    if (!respuesta) {
      return Response.json({ error: "No he sabido qué responder a eso." }, { status: 502 });
    }

    return Response.json({ respuesta });
  } catch (err) {
    console.error("Fallo del Asistente desde Telegram:", err);
    Sentry.captureException(err);
    return Response.json(
      { error: "No he podido responder ahora mismo. Inténtalo en un momento." },
      { status: 502 },
    );
  }
}
