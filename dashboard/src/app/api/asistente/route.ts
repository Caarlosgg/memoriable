import { groq } from "@ai-sdk/groq";
import * as Sentry from "@sentry/nextjs";
import { streamText, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, stepCountIs } from "ai";
import type { ToolSet, UIMessage, InferUITools, UIDataTypes } from "ai";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { isSessionActive } from "@/lib/sessionRevocation";
import { tryConsumeAssistantBudget } from "@/lib/assistantBudget";
import type { AssistantSource } from "@/lib/assistantContext";
import type { AssistantTools } from "@/lib/assistantTools";
import { prepararAsistente } from "@/lib/assistantRun";
import { ensureConversation, saveExchange } from "@/lib/assistantHistory";
import { getActiveWorkspace } from "@/lib/workspace";

// Verificado en vivo: una petición con dos llamadas a herramienta con
// `repetir` (crearEvento + registrarAhorro, 5 repeticiones cada una) tardó
// 37s de punta a punta — por encima de los 30s que tenía antes. 60s es el
// límite disponible en el plan gratuito de Vercel (Hobby) sin activar nada
// de pago, y deja margen de sobra para ese caso real.
export const maxDuration = 60;

const DEFAULT_MAX_QUESTIONS_PER_DAY = 30;
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
  const session = await verifySessionToken(token);
  if (!session || !(await isSessionActive(session.userId, session.issuedAt))) {
    return errorResponse("No autenticado", 401);
  }
  const sessionUserId = session.userId;
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
    const canProceed = await tryConsumeAssistantBudget(maxPerDay, userId);
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

  // Notas ya citadas en turnos ANTERIORES de esta misma conversación (los
  // metadatos de cada mensaje del Asistente van y vuelven con `messages`,
  // ver messageMetadata más abajo) — repetir la misma fuente en cada turno
  // es justo el ruido que se quería quitar (ver Hito 4): si el usuario ya
  // la vio hace dos mensajes, no hace falta volver a enseñarla.
  const alreadyCitedIds = new Set(
    messages.flatMap((m) => m.metadata?.sources?.map((s) => s.id) ?? []),
  );

  // Todo el contexto del Asistente (fuentes, workspace, equipos, cifras,
  // memoria) y sus herramientas se montan en `prepararAsistente`, compartido
  // con la ruta del bot de Telegram — ver assistantRun.ts sobre por qué no
  // vive aquí dentro. La conversación sí es propia de la web: Telegram no
  // tiene hilos.
  const [conversationId, preparado] = await Promise.all([
    resolveConversationId(),
    prepararAsistente({ userId, pregunta: question, workspaceId, isPersonal, role, yaCitadas: alreadyCitedIds }),
  ]);
  const { system, tools, sources } = preparado;

  const result = streamText({
    model: groq("openai/gpt-oss-120b"),
    system,
    messages: await convertToModelMessages(messages),
    tools,
    // Permite encadenar la llamada a `crearNota` con la respuesta de texto
    // que la confirma, en el mismo turno (si no, el SDK se pararía justo
    // después de ejecutar la tool sin generar el mensaje final).
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
    // 'medium' (subido desde 'low'): el Asistente ahora hace más — cita
    // fuentes con umbral, consulta el equipo, actúa sobre tareas por
    // nombre — y ese razonamiento algo más profundo se nota en respuestas
    // más precisas, a cambio de una latencia todavía muy por debajo de lo
    // que se notaría como lento (Groq sigue siendo el proveedor más rápido
    // disponible). 'hidden' evita que el razonamiento se mezcle con el
    // texto visible de la respuesta.
    providerOptions: {
      groq: { reasoningEffort: "medium", reasoningFormat: "hidden" },
    },
    // No crítico: si guardar el historial falla, no debe tirar la
    // respuesta que el usuario ya está viendo — solo se registra el aviso.
    //
    // `text` puede venir vacío aunque el turno SÍ haya hecho algo: si
    // `stopWhen` corta justo después de una llamada a herramienta (crear
    // una nota, asignar una tarea…) sin que el modelo llegue a generar el
    // mensaje de confirmación, antes se perdía el intercambio entero — el
    // usuario veía el resultado en pantalla, pero al recargar desaparecía.
    // `toolCalls` cubre ese caso con una respuesta de reserva corta.
    onFinish: async ({ text, toolCalls }) => {
      if (!question) return;
      const respuesta = text || (toolCalls.length > 0 ? "Hecho — acción completada." : "");
      if (!respuesta) return;
      try {
        await saveExchange(userId, conversationId, question, respuesta);
      } catch (err) {
        console.error("No se pudo guardar el intercambio en el historial:", err);
      }
    },
    // Si la generación se aborta a medias (p. ej. el cliente cierra la
    // conexión, o un turno lento choca con `maxDuration`), `onFinish` nunca
    // llega a llamarse — sin esto, el turno desaparecía en silencio.
    onAbort: async () => {
      if (!question) return;
      try {
        await saveExchange(userId, conversationId, question, "(La respuesta se interrumpió antes de completarse.)");
      } catch (err) {
        console.error("No se pudo guardar el intercambio interrumpido en el historial:", err);
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
