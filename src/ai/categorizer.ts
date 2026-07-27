import { env } from '../config/env.js';
import {
  CATEGORIES,
  type Analysis,
  type Categorizer,
  type Category,
  type IncomingMessage,
  isCategory,
} from './types.js';

/**
 * Interfaz mínima del cliente de Claude que usa el categorizador. Se define
 * aquí (en vez de depender del tipo completo de la SDK) para que los tests
 * puedan inyectar un mock trivial sin construir un cliente real. El cliente
 * real de Anthropic es estructuralmente compatible.
 */
export interface ClaudeClient {
  messages: {
    create(params: unknown): Promise<{
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string | null;
    }>;
  };
}

const SYSTEM_PROMPT = [
  'Eres un asistente que clasifica y resume mensajes cortos en español.',
  'Devuelve SIEMPRE un JSON válido con exactamente dos campos:',
  '  - "categoria": una de estas etiquetas exactas: ' + CATEGORIES.join(', ') + '.',
  '  - "resumen": un resumen conciso (una frase) del mensaje.',
  'No añadas texto fuera del JSON.',
].join('\n');

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    categoria: { type: 'string', enum: [...CATEGORIES] },
    resumen: { type: 'string' },
  },
  required: ['categoria', 'resumen'],
  additionalProperties: false,
} as const;

/** Extrae el primer bloque de texto de la respuesta de Claude. */
function firstText(content: Array<{ type: string; text?: string }>): string {
  const block = content.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!block || typeof block.text !== 'string') {
    throw new Error('La respuesta de Claude no contiene ningún bloque de texto.');
  }
  return block.text;
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
    throw new Error('La respuesta de Claude no es un JSON válido: ' + raw.slice(0, 200));
  }

  const record = (data ?? {}) as Record<string, unknown>;
  const categoria: Category = isCategory(record.categoria) ? record.categoria : 'otro';
  const resumenRaw = typeof record.resumen === 'string' ? record.resumen.trim() : '';
  const resumen = resumenRaw.length > 0 ? resumenRaw : fallbackContenido.trim().slice(0, 140);

  return { categoria, resumen };
}

/**
 * Categorizador que usa la API de Anthropic (Claude). No conoce Telegram ni la
 * base de datos: solo transforma un mensaje en un análisis.
 */
export class AnthropicCategorizer implements Categorizer {
  constructor(
    private readonly client: ClaudeClient,
    private readonly model: string = env.ANTHROPIC_MODEL,
  ) {}

  async analyze(message: IncomingMessage): Promise<Analysis> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [{ role: 'user', content: message.contenido }],
    });

    return parseAnalysis(firstText(response.content), message.contenido);
  }
}
