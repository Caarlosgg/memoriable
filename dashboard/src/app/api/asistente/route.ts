import { groq } from "@ai-sdk/groq";
import { streamText, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream } from "ai";
import type { ToolSet, UIMessage } from "ai";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { resolveEmbedder } from "@/lib/pipeline";
import { findSimilarMessages } from "@/lib/vectorSearch";
import { tryConsumeAssistantBudget } from "@/lib/assistantBudget";
import { toAssistantSources, buildContextBlock, buildSystemPrompt, type AssistantSource } from "@/lib/assistantContext";

export const maxDuration = 30;

const DEFAULT_MAX_QUESTIONS_PER_DAY = 30;
const SOURCES_PER_ANSWER = 5;

type AssistantMessage = UIMessage<{ sources?: AssistantSource[] }>;

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
  if (!(await verifySessionToken(token))) {
    return errorResponse("No autenticado", 401);
  }

  if (!process.env.GROQ_API_KEY) {
    // Sin fallback posible aquí (a diferencia de la captura rápida): no hay
    // "Asistente offline" que sintetice lenguaje natural sin un LLM.
    return errorResponse("El Asistente no está configurado (falta GROQ_API_KEY).", 503);
  }

  const maxPerDay = Number(process.env.ASSISTANT_MAX_QUESTIONS_PER_DAY ?? DEFAULT_MAX_QUESTIONS_PER_DAY);
  const canProceed = await tryConsumeAssistantBudget(maxPerDay);
  if (!canProceed) {
    return errorResponse("Se alcanzó el límite de preguntas al Asistente por hoy. Vuelve mañana.", 429);
  }

  const { messages }: { messages: AssistantMessage[] } = await req.json();
  const question = lastUserQuestion(messages);

  // Nunca bloquea la respuesta: sin GEMINI_API_KEY (o si Gemini falla),
  // embedQuery devuelve null y el Asistente responde igual, solo que sin
  // notas citadas — dice con naturalidad que no encontró nada relevante
  // (ver el system prompt en assistantContext.ts).
  let sources: AssistantSource[] = [];
  if (question) {
    const queryEmbedding = await resolveEmbedder().embedQuery(question);
    if (queryEmbedding) {
      const similar = await findSimilarMessages(queryEmbedding, { limit: SOURCES_PER_ANSWER });
      sources = toAssistantSources(similar);
    }
  }

  const result = streamText({
    model: groq("openai/gpt-oss-120b"),
    system: buildSystemPrompt(buildContextBlock(sources)),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<ToolSet, AssistantMessage>({
      stream: result.stream,
      // Se llama en 'start' y 'finish'; las fuentes ya están decididas antes
      // de streamear (búsqueda determinista previa), así que basta con
      // devolver el mismo valor fijo en ambos casos.
      messageMetadata: () => ({ sources }),
      // Evita que se filtren detalles internos del error (p. ej. de Groq)
      // al cliente; el mensaje genérico es suficiente para que la UI lo
      // muestre sin crashear.
      onError: () => "No se ha podido generar una respuesta. Inténtalo de nuevo en un momento.",
    }),
  });
}
