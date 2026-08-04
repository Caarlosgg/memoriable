const TITLE_MAX_LENGTH = 60;

/**
 * Título autogenerado de una conversación a partir de su primera pregunta.
 * Pura, sin imports de servidor: la usan tanto assistantHistory.ts (al
 * crear la conversación en BD) como AssistantChat.tsx (para reflejarlo en
 * la lista de conversaciones al instante, sin esperar a la respuesta del
 * servidor) — debe dar el mismo resultado en los dos sitios.
 */
export function titleFromQuestion(question: string): string {
  const trimmed = question.trim();
  if (trimmed === "") return "Nueva conversación";
  return trimmed.length <= TITLE_MAX_LENGTH ? trimmed : `${trimmed.slice(0, TITLE_MAX_LENGTH - 1)}…`;
}
