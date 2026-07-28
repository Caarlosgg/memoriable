import { describe, expect, it, vi } from 'vitest';
import { GroqCategorizer, parseAnalysis, type GroqChatClient } from '../src/ai/categorizer.js';

function mockClient(content: string): GroqChatClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

describe('parseAnalysis', () => {
  it('parsea una respuesta válida', () => {
    const out = parseAnalysis('{"categoria":"tarea","resumen":"Comprar leche"}', 'orig');
    expect(out).toEqual({ categoria: 'tarea', resumen: 'Comprar leche' });
  });

  it('cae a "otro" si la categoría es desconocida', () => {
    const out = parseAnalysis('{"categoria":"marciano","resumen":"algo"}', 'orig');
    expect(out.categoria).toBe('otro');
  });

  it('usa el contenido original como resumen si viene vacío', () => {
    const out = parseAnalysis('{"categoria":"nota","resumen":"  "}', 'contenido original');
    expect(out.resumen).toBe('contenido original');
  });

  it('lanza si el texto no es JSON válido', () => {
    expect(() => parseAnalysis('esto no es json', 'orig')).toThrow(/no es un JSON válido/);
  });
});

describe('GroqCategorizer', () => {
  it('analiza un mensaje usando el cliente de Groq', async () => {
    const client = mockClient('{"categoria":"pregunta","resumen":"¿Qué hora es?"}');
    const categorizer = new GroqCategorizer(client, 'openai/gpt-oss-120b');

    const result = await categorizer.analyze({ tipo: 'text', contenido: '¿Qué hora es?' });

    expect(result).toEqual({ categoria: 'pregunta', resumen: '¿Qué hora es?' });
    expect(client.chat.completions.create).toHaveBeenCalledOnce();

    const params = (client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(params.model).toBe('openai/gpt-oss-120b');
    // El mensaje del usuario va como último turno; el primero es el system prompt.
    expect(params.messages[1].content).toBe('¿Qué hora es?');
    // Pide JSON explícitamente: sin esto el modelo tiende a envolverlo en prosa.
    expect(params.response_format).toEqual({ type: 'json_object' });
  });

  it('lanza si la respuesta no trae contenido', async () => {
    const client: GroqChatClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] }),
        },
      },
    };
    const categorizer = new GroqCategorizer(client);
    await expect(categorizer.analyze({ tipo: 'text', contenido: 'x' })).rejects.toThrow(
      /ningún bloque de texto/,
    );
  });

  it('lanza si la respuesta no trae ninguna opción', async () => {
    const client: GroqChatClient = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } },
    };
    const categorizer = new GroqCategorizer(client);
    await expect(categorizer.analyze({ tipo: 'text', contenido: 'x' })).rejects.toThrow(
      /ningún bloque de texto/,
    );
  });
});
