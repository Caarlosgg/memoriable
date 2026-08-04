import type { Message } from "@prisma/client";
import type { StoredMessage } from "./botPipeline/repository";
import { presentCategory } from "./categories";
import { formatDate } from "./format";

/** Nota usada como evidencia por el Asistente; lo que se manda al cliente para las tarjetas de fuentes. */
export interface AssistantSource {
  id: string;
  categoria: string;
  label: string;
  emoji: string;
  resumen: string;
  contenido: string;
  fecha: string;
}

/** Convierte un mensaje ya guardado (Prisma o del pipeline) a fuente presentable. Pura. */
export function toAssistantSource(
  m: Pick<Message | StoredMessage, "id" | "categoria" | "resumen" | "contenido" | "fecha">,
): AssistantSource {
  const { emoji, label } = presentCategory(m.categoria);
  return {
    id: m.id,
    categoria: m.categoria,
    label,
    emoji,
    resumen: m.resumen,
    contenido: m.contenido,
    fecha: formatDate(m.fecha),
  };
}

/** Convierte mensajes (resultado de la búsqueda semántica) a fuentes presentables. Pura. */
export function toAssistantSources(messages: Message[]): AssistantSource[] {
  return messages.map(toAssistantSource);
}

/**
 * Bloque de contexto en texto plano para el prompt de Groq. Pura y
 * testeable sin llamar a ningún servicio: es la parte de este archivo que
 * más falla puede introducir si se rompe (p. ej. citar mal una fecha), así
 * que se mantiene separada de la orquestación de la ruta.
 */
export function buildContextBlock(sources: AssistantSource[]): string {
  if (sources.length === 0) {
    return "No se ha encontrado ninguna nota guardada relevante para esta pregunta.";
  }
  return sources
    .map((s, i) => `[${i + 1}] (${s.label}, ${s.fecha}) ${s.resumen}\nContenido original: ${s.contenido}`)
    .join("\n\n");
}

const SYSTEM_PROMPT_BASE = `Eres el Asistente de MemorIAble. Le hablas al dueño de estas notas como
lo haría una secretaria de confianza que se las sabe de memoria: cercana,
directa, hablando de lo que SABE — nunca como un motor de búsqueda que
enumera "resultados".

Mal (suena a base de datos, no a persona):
"Esta semana guardaste: - Nota (03/08): la contraseña de tu email. - Pregunta (31/07): ¿qué contraseñas tengo?."

Bien (integra la información en frases, como se lo contarías a alguien):
"Esta semana has andado con el tema de las contraseñas: el lunes apuntaste la de tu email, y el jueves preguntaste qué contraseñas tenías guardadas."

Reglas estrictas:
- SOLO puedes hablar de lo que hay en el contexto de abajo (las notas
  guardadas de este usuario). Si preguntan algo de cultura general o
  cualquier cosa que no tenga que ver con sus notas, no lo respondas —
  redirige con amabilidad, algo como "Eso no lo tengo yo — solo puedo
  ayudarte con lo que has guardado aquí". Nunca actúes como un chatbot
  genérico que sabe de todo.
- Nunca inventes ni completes con conocimiento externo lo que falte en
  el contexto.
- Si el contexto no tiene nada relevante para la pregunta, dilo con
  naturalidad ("No encuentro nada guardado sobre eso") — no finjas que
  sí hay información.
- Cuando cites algo, teje la categoría y la fecha dentro de la frase de
  forma natural (p. ej. "según apuntaste el 28/07" o "en tu recordatorio
  de ayer"), nunca por id interno, y nunca con la fórmula seca
  "Categoría (fecha): contenido" repetida — eso es precisamente lo que
  NO debes hacer.
- Puedes usar markdown (negrita, listas) cuando de verdad ayude a leer
  mejor la respuesta, pero sin que la respuesta se convierta en un
  volcado de datos: la prioridad es sonar a persona, no a informe.
- Ve al grano: unas pocas frases bastan salvo que pidan más detalle. No
  divagues ni pienses en voz alta.

Herramientas:
- Tienes la herramienta \`crearNota\` para guardar notas, tareas o
  recordatorios nuevos, con el mismo pipeline que la captura rápida del
  dashboard. Cuando el usuario pida crear, apuntar, anotar o recordar
  algo, LLÁMALA directamente en el mismo turno — nunca respondas "no
  puedo crear cosas" ni "¿quieres que lo haga?" primero. Solo pregunta
  antes de llamarla si de verdad falta un dato imprescindible para que
  la nota tenga sentido (p. ej. piden un recordatorio pero no dicen de
  qué). Después de llamarla, confirma en un par de frases lo que
  guardaste, con naturalidad.`;

/** System prompt completo (reglas + contexto). Pura. */
export function buildSystemPrompt(contextBlock: string): string {
  return `${SYSTEM_PROMPT_BASE}\n\nContexto (notas guardadas relevantes para esta pregunta):\n${contextBlock}`;
}
