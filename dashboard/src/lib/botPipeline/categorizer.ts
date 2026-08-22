// Copia sincronizada de ../../../../src/ai/categorizer.ts — ver
// botPipeline/README.md para el porqué de la copia.

import {
  CATEGORIES,
  type Analysis,
  type Categorizer,
  type Category,
  type IncomingMessage,
  isCategory,
} from './types';

/**
 * Interfaz mínima del cliente de Groq que usa el categorizador. El cliente
 * real de Groq es estructuralmente compatible.
 */
export interface GroqChatClient {
  chat: {
    completions: {
      create(params: unknown): Promise<{
        choices: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

const SYSTEM_PROMPT = [
  'Eres un asistente que clasifica y resume mensajes cortos en español.',
  'Devuelve SIEMPRE un JSON válido con estos campos:',
  '  - "categoria": una de estas etiquetas exactas: ' + CATEGORIES.join(', ') + '.',
  '  - "resumen": un resumen conciso (una frase) del mensaje.',
  '  - "confianza": un número entre 0 y 1, qué tan seguro estás de la categoría elegida.',
  '  - "pregunta_aclaratoria" (opcional, solo si hace falta): si el mensaje es una',
  '    tarea o recordatorio pero le falta un dato importante para tener sentido del',
  '    todo (sobre todo una fecha/hora concreta), una pregunta MUY corta para pedirlo,',
  '    en tono natural (p. ej. "¿Para qué día lo recuerdo?"). Si el mensaje ya está',
  '    completo o no es tarea/recordatorio, omite este campo.',
  'No añadas texto fuera del JSON.',
].join('\n');

/** Extrae el texto de la respuesta del modelo. */
function firstText(choices: Array<{ message?: { content?: string | null } }>): string {
  const content = choices[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('La respuesta de Groq no contiene ningún bloque de texto.');
  }
  return content;
}

/**
 * Normaliza la respuesta cruda del modelo a un `Analysis` válido. Tolera
 * categorías desconocidas (cae a "otro") y resúmenes vacíos.
 */
export function parseAnalysis(raw: string, fallbackContenido: string): Analysis {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('La respuesta del modelo no es un JSON válido: ' + raw.slice(0, 200));
  }

  const record = (data ?? {}) as Record<string, unknown>;
  const categoria: Category = isCategory(record.categoria) ? record.categoria : 'otro';
  const resumenRaw = typeof record.resumen === 'string' ? record.resumen.trim() : '';
  const resumen = resumenRaw.length > 0 ? resumenRaw : fallbackContenido.trim().slice(0, 140);

  const confianzaRaw = record.confianza;
  const confianza =
    typeof confianzaRaw === 'number' && Number.isFinite(confianzaRaw)
      ? Math.min(1, Math.max(0, confianzaRaw))
      : undefined;

  // Solo tiene sentido pedir una aclaración sobre algo accionable (tarea/
  // recordatorio) — para el resto de categorías se ignora aunque el modelo
  // la incluya por error.
  const preguntaRaw = record.pregunta_aclaratoria;
  const esAccionable = categoria === 'tarea' || categoria === 'recordatorio';
  const preguntaAclaratoria =
    esAccionable && typeof preguntaRaw === 'string' && preguntaRaw.trim().length > 0
      ? preguntaRaw.trim().slice(0, 200)
      : undefined;

  return { categoria, resumen, confianza, preguntaAclaratoria };
}

/**
 * Categorizador que usa la API de Groq. No conoce Telegram, la base de
 * datos, ni variables de entorno: solo transforma un mensaje en un análisis
 * dado un cliente y un modelo ya resueltos por quien lo construye.
 */
export class GroqCategorizer implements Categorizer {
  constructor(
    private readonly client: GroqChatClient,
    private readonly model: string,
  ) {}

  async analyze(message: IncomingMessage): Promise<Analysis> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      // Clasificar un mensaje corto no requiere cadena de razonamiento larga:
      // 'low' abarata y acelera, y 'hidden' mantiene el contenido como JSON
      // limpio (sin el razonamiento mezclado en la respuesta).
      reasoning_effort: 'low',
      reasoning_format: 'hidden',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message.contenido },
      ],
    });

    return parseAnalysis(firstText(response.choices), message.contenido);
  }
}
