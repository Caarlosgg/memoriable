import { groq } from "@ai-sdk/groq";
import * as Sentry from "@sentry/nextjs";
import { streamText, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, stepCountIs } from "ai";
import type { ToolSet, UIMessage, InferUITools, UIDataTypes } from "ai";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { resolveEmbedder } from "@/lib/pipeline";
import { findSimilarMessages } from "@/lib/vectorSearch";
import { tryConsumeAssistantBudget } from "@/lib/assistantBudget";
import { toAssistantSources, buildContextBlock, buildSystemPrompt, buildWorkspaceContextLine, buildAmbientBlock, type AssistantSource } from "@/lib/assistantContext";
import { resolveAmbientStats, resolveWorkspaceNombre } from "@/lib/assistantAmbient";
import { createAssistantTools, type AssistantTools } from "@/lib/assistantTools";
import { ensureConversation, saveExchange } from "@/lib/assistantHistory";
import { getActiveWorkspace } from "@/lib/workspace";

// Verificado en vivo: una petición con dos llamadas a herramienta con
// `repetir` (crearEvento + registrarAhorro, 5 repeticiones cada una) tardó
// 37s de punta a punta — por encima de los 30s que tenía antes. 60s es el
// límite disponible en el plan gratuito de Vercel (Hobby) sin activar nada
// de pago, y deja margen de sobra para ese caso real.
export const maxDuration = 60;

const DEFAULT_MAX_QUESTIONS_PER_DAY = 30;
const SOURCES_PER_ANSWER = 5;
// Turnos de herramienta que se dejan encadenar antes de forzar la respuesta
// final. Ya no es la defensa principal contra peticiones repetidas ("todos
// los jueves durante 5 semanas") — para eso, crearEvento/registrarAhorro
// tienen su propio parámetro `repetir` que crea toda la serie en UNA
// llamada (ver assistantTools.ts). Subir esto mucho para compensar un
// bucle de llamadas manual resultó contraproducente: cada llamada a
// herramienta es una ida y vuelta completa a Groq, y con varias seguidas
// se verificó en vivo que la respuesta podía quedarse colgada mucho más
// allá de `maxDuration`. 8 deja margen para combinar un puñado de
// acciones distintas en un turno sin ese riesgo.
const MAX_TOOL_STEPS = 8;

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
  const sessionUserId = await verifySessionToken(token);
  if (!sessionUserId) {
    return errorResponse("No autenticado", 401);
  }
  // Reasignado a un `const` propio: el estrechamiento de tipo de
  // `sessionUserId` (de `string | null` a `string`) tras el `if` de arriba
  // no se propaga dentro de las funciones anidadas de más abajo (TypeScript
  // analiza los closures contra el tipo declarado, no el estrechado en el
  // punto de captura) — `userId` sí queda tipado `string` sin más.
  const userId: string = sessionUserId;
  // Fase Equipo: qué workspace usan crearNota/crearEvento/completarTarea/
  // editarEvento/borrarEvento y las notas citadas — resuelto una vez aquí,
  // no dentro de cada tool, para que toda la petición opere sobre el mismo
  // workspace de principio a fin.
  const { workspaceId, isPersonal, role } = await getActiveWorkspace(userId);

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
  async function resolveConversationId(): Promise<string> {
    if (!question) return requestedConversationId;
    try {
      return await ensureConversation(userId, requestedConversationId, question);
    } catch (err) {
      console.error("No se pudo preparar la conversación (se responde igual):", err);
      return requestedConversationId;
    }
  }

  // Nunca bloquea la respuesta: sin GEMINI_API_KEY (o si Gemini/BD fallan),
  // el Asistente responde igual, solo que sin notas citadas — dice con
  // naturalidad que no encontró nada relevante (ver el system prompt en
  // assistantContext.ts).
  async function resolveSources(): Promise<AssistantSource[]> {
    if (!question) return [];
    try {
      const queryEmbedding = await resolveEmbedder().embedQuery(question);
      if (!queryEmbedding) return [];
      const similar = await findSimilarMessages(workspaceId, queryEmbedding, { limit: SOURCES_PER_ANSWER });
      return toAssistantSources(similar);
    } catch (err) {
      console.error("No se pudieron recuperar notas relevantes (se responde sin fuentes):", err);
      return [];
    }
  }

  // Nunca bloquea la respuesta ni la degrada de forma visible: si falla,
  // el Asistente simplemente no menciona en qué equipo está trabajando el
  // usuario (sigue funcionando, solo con un prompt algo menos afinado).
  async function resolveWorkspaceLine(): Promise<string> {
    if (isPersonal) return "";
    try {
      const nombre = await resolveWorkspaceNombre(workspaceId);
      return buildWorkspaceContextLine({ isPersonal, nombre, role });
    } catch (err) {
      console.error("No se pudo resolver el nombre del workspace activo (se continúa sin mencionarlo):", err);
      return "";
    }
  }

  // Igual de no-crítico que resolveSources: si falla, el Asistente responde
  // igual, solo sin el bloque de "cómo va la semana".
  async function resolveAmbient(): Promise<string> {
    try {
      return buildAmbientBlock(await resolveAmbientStats(workspaceId));
    } catch (err) {
      console.error("No se pudieron calcular las cifras ambientales (se responde sin ellas):", err);
      return "";
    }
  }

  // Independientes entre sí (ninguna depende del resultado de otra) — en
  // paralelo en vez de en secuencia recorta el tiempo hasta el primer
  // token de la respuesta. Cada una atrapa sus propios errores, así que
  // Promise.all nunca rechaza por un fallo aislado de una de ellas.
  const [conversationId, sources, workspaceLine, ambientBlock] = await Promise.all([
    resolveConversationId(),
    resolveSources(),
    resolveWorkspaceLine(),
    resolveAmbient(),
  ]);

  const result = streamText({
    model: groq("openai/gpt-oss-120b"),
    system: buildSystemPrompt(buildContextBlock(sources), new Date(), { workspaceLine, ambientBlock }),
    messages: await convertToModelMessages(messages),
    tools: createAssistantTools(userId, workspaceId, role),
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
      // muestre sin crashear. Este SÍ va a Sentry (a diferencia de los
      // catches "no crítico" de arriba): un fallo aquí es justo lo que ve
      // el usuario como "no funciona", no un best-effort de segundo plano.
      onError: (err) => {
        Sentry.captureException(err);
        return "No se ha podido generar una respuesta. Inténtalo de nuevo en un momento.";
      },
    }),
  });
}
