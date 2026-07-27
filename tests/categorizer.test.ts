import { describe, expect, it, vi } from 'vitest';
import { AnthropicCategorizer, parseAnalysis, type ClaudeClient } from '../src/ai/categorizer.js';

function mockClient(text: string): ClaudeClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
      }),
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

describe('AnthropicCategorizer', () => {
  it('analiza un mensaje usando el cliente de Claude', async () => {
    const client = mockClient('{"categoria":"pregunta","resumen":"¿Qué hora es?"}');
    const categorizer = new AnthropicCategorizer(client, 'claude-opus-4-8');

    const result = await categorizer.analyze({ tipo: 'text', contenido: '¿Qué hora es?' });

    expect(result).toEqual({ categoria: 'pregunta', resumen: '¿Qué hora es?' });
    expect(client.messages.create).toHaveBeenCalledOnce();
    const params = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(params.model).toBe('claude-opus-4-8');
    expect(params.messages[0].content).toBe('¿Qué hora es?');
  });

  it('lanza si la respuesta no trae bloque de texto', async () => {
    const client: ClaudeClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [], stop_reason: 'end_turn' }) },
    };
    const categorizer = new AnthropicCategorizer(client);
    await expect(categorizer.analyze({ tipo: 'text', contenido: 'x' })).rejects.toThrow(
      /ningún bloque de texto/,
    );
  });
});
