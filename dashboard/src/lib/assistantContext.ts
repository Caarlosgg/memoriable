import type { Message } from "@prisma/client";
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

/** Convierte mensajes (resultado de la búsqueda semántica) a fuentes presentables. Pura. */
export function toAssistantSources(messages: Message[]): AssistantSource[] {
  return messages.map((m) => {
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
  });
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

const SYSTEM_PROMPT_BASE = `Eres el Asistente de MemorIAble, una app de notas personales. Respondes preguntas del usuario sobre SUS PROPIAS notas guardadas.

Reglas estrictas:
- Usa ÚNICAMENTE la información del contexto de abajo. Nunca inventes ni completes con conocimiento externo.
- Si el contexto no tiene nada relevante para la pregunta, dilo con naturalidad ("No encuentro nada guardado sobre eso") — no finjas que sí hay información.
- Cuando cites algo, refiérete a la nota por su categoría y fecha (p. ej. "según tu recordatorio del 28/07"), nunca por ids internos.
- Responde en español, en un tono cercano y natural, como alguien que conoce bien tus notas — no como una lista de resultados de búsqueda.
- Sé conciso: unas pocas frases bastan salvo que la pregunta pida más detalle.`;

/** System prompt completo (reglas + contexto). Pura. */
export function buildSystemPrompt(contextBlock: string): string {
  return `${SYSTEM_PROMPT_BASE}\n\nContexto (notas guardadas relevantes para esta pregunta):\n${contextBlock}`;
}
