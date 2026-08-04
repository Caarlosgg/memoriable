import { groq } from "@ai-sdk/groq";
import { streamText, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, stepCountIs } from "ai";
import type { ToolSet, UIMessage, InferUITools, UIDataTypes } from "ai";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { resolveEmbedder } from "@/lib/pipeline";
import { findSimilarMessages } from "@/lib/vectorSearch";
import { tryConsumeAssistantBudget } from "@/lib/assistantBudget";
import { toAssistantSources, buildContextBlock, buildSystemPrompt, type AssistantSource } from "@/lib/assistantContext";
import { createAssistantTools, type AssistantTools } from "@/lib/assistantTools";
import { ensureConversation, saveExchange } from "@/lib/assistantHistory";

export const maxDuration = 30;

const DEFAULT_MAX_QUESTIONS_PER_DAY = 30;
const SOURCES_PER_ANSWER = 5;
/** Turnos de herramienta que se dejan encadenar antes de forzar la respuesta final. */
const MAX_TOOL_STEPS = 4;

type AssistantMessage = UIMessage<
  { sources?: AssistantSource[]; conversationId?: string },
  UIDataTypes,
  InferUITools<AssistantTools>
>;

// Texto plano, no JSON: `useChat` usa el cuerpo de una respuesta no-2xx tal
// cual como `error.message` (no lo interpreta como stream de UI), así que
// devolver JSON aquí haría que el usuario viera el JSON crudo en pantalla.
function errorResponse(message: string, status: number): Response {
  return new Response(message, { status });
}

/** Texto del último mensaje del usuario (los `parts` de tipo texto, unidos). */
function lastUserQuestion(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return last.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

// Fuera del matcher de proxy.ts (las rutas de API comprueban su propia
// sesión y responden 401 en JSON en vez de redirigir a /login).
export async function POST(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const userId = await verifySessionToken(token);
  if (!userId) {
    return errorResponse("No autenticado", 401);
  }

  if (!process.env.GROQ_API_KEY) {
    // Sin fallback posible aquí (a diferencia de la captura rápida): no hay
    // "Asistente offline" que sintetice lenguaje natural sin un LLM.
    return errorResponse("El Asistente no está configurado (falta GROQ_API_KEY).", 503);
  }

  // El fusible de coste es best-effort: si la BD tiene un fallo puntual al
  // consultarlo, no se bloquea al usuario — se registra y se sigue (fail-open).
  const maxPerDay = Number(process.env.ASSISTANT_MAX_QUESTIONS_PER_DAY ?? DEFAULT_MAX_QUESTIONS_PER_DAY);
  try {
    const canProceed = await tryConsumeAssistantBudget(maxPerDay);
    if (!canProceed) {
      return errorResponse("Se alcanzó el límite de preguntas al Asistente por hoy. Vuelve mañana.", 429);
    }
  } catch (err) {
    console.error("No se pudo comprobar el fusible de coste del Asistente (se continúa):", err);
  }

  let body: { messages: AssistantMessage[]; conversationId: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("La petición no es válida.", 400);
  }
  const { messages, conversationId: requestedConversationId } = body;
  const question = lastUserQuestion(messages ?? []);

  // El cliente genera el id al empezar un chat nuevo (una conversación es
  // "suya" desde el primer mensaje); aquí solo se confirma que existe y que
  // de verdad pertenece a este usuario (ver ensureConversation) antes de
  // guardar nada en ella. Si la BD falla, se sigue con el id propuesto: se
  // responde igual, solo que ese intercambio podría no quedar guardado (el
  // onFinish tiene su propio try/catch).
  let conversationId = requestedConversationId;
  if (question) {
    try {
      conversationId = await ensureConversation(userId, requestedConversationId, question);
    } catch (err) {
      console.error("No se pudo preparar la conversación (se responde igual):", err);
    }
  }

  // Nunca bloquea la respuesta: sin GEMINI_API_KEY (o si Gemini/BD fallan),
  // el Asistente responde igual, solo que sin notas citadas — dice con
  // naturalidad que no encontró nada relevante (ver el system prompt en
  // assistantContext.ts).
  let sources: AssistantSource[] = [];
  if (question) {
    try {
      const queryEmbedding = await resolveEmbedder().embedQuery(question);
      if (queryEmbedding) {
        const similar = await findSimilarMessages(userId, queryEmbedding, { limit: SOURCES_PER_ANSWER });
        sources = toAssistantSources(similar);
      }
    } catch (err) {
      console.error("No se pudieron recuperar notas relevantes (se responde sin fuentes):", err);
    }
  }

  const result = streamText({
    model: groq("openai/gpt-oss-120b"),
    system: buildSystemPrompt(buildContextBlock(sources)),
    messages: await convertToModelMessages(messages),
    tools: createAssistantTools(userId),
    // Permite encadenar la llamada a `crearNota` con la respuesta de texto
    // que la confirma, en el mismo turno (si no, el SDK se pararía justo
    // después de ejecutar la tool sin generar el mensaje final).
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
    // Mismo criterio que el categorizador del bot (src/ai/categorizer.ts):
    // clasificar/responder sobre un puñado de notas cortas no necesita
    // cadena de razonamiento larga. 'low' da respuestas más directas y
    // rápidas; 'hidden' evita que el razonamiento se mezcle con el texto
    // visible de la respuesta.
    providerOptions: {
      groq: { reasoningEffort: "low", reasoningFormat: "hidden" },
    },
    // No crítico: si guardar el historial falla, no debe tirar la
    // respuesta que el usuario ya está viendo — solo se registra el aviso.
    onFinish: async ({ text }) => {
      if (!question || !text) return;
      try {
        await saveExchange(userId, conversationId, question, text);
      } catch (err) {
        console.error("No se pudo guardar el intercambio en el historial:", err);
      }
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<ToolSet, AssistantMessage>({
      stream: result.stream,
      // Se llama en 'start' y 'finish'; las fuentes y el id de conversación
      // ya están decididos antes de streamear, así que basta con devolver
      // el mismo valor fijo en ambos casos.
      messageMetadata: () => ({ sources, conversationId }),
      // No hay reasoning que mostrar (reasoningFormat: "hidden" arriba);
      // desactivarlo explícitamente evita mandar un part de más al cliente.
      sendReasoning: false,
      // Evita que se filtren detalles internos del error (p. ej. de Groq)
      // al cliente; el mensaje genérico es suficiente para que la UI lo
      // muestre sin crashear.
      onError: () => "No se ha podido generar una respuesta. Inténtalo de nuevo en un momento.",
    }),
  });
}
