import { describe, expect, it, vi } from 'vitest';
import { handleSearchCommand } from '../src/telegram/bot.js';
import { InMemoryMessageRepository, type StoredMessage } from '../src/db/repository.js';
import type { Pipeline } from '../src/pipeline/processMessage.js';
import type { Embedder } from '../src/ai/types.js';

/**
 * Embedder de juguete: cada texto se convierte en un vector según qué
 * palabras clave contiene. Suficiente para comprobar la POLÍTICA de mezcla
 * (que es lo que se está probando), sin llamar a Gemini.
 */
const embedder: Embedder = {
  async embedDocument(text: string) {
    return vectorDe(text);
  },
  async embedQuery(text: string) {
    return vectorDe(text);
  },
};

function vectorDe(text: string): number[] {
  const t = text.toLowerCase();
  return [
    /fontaner|agua|grifo|tuber/.test(t) ? 1 : 0,
    /factura|banco|pago/.test(t) ? 1 : 0,
    /reuni|equipo/.test(t) ? 1 : 0,
  ];
}

async function pipelineCon(notas: string[], conEmbedder = true): Promise<Pipeline> {
  const repository = new InMemoryMessageRepository();
  for (const contenido of notas) {
    await repository.save('ana', {
      tipo: 'text',
      contenido,
      categoria: 'nota',
      resumen: contenido,
      embedding: vectorDe(contenido),
    });
  }
  return {
    repository,
    categorizer: { analyze: vi.fn() },
    ...(conEmbedder ? { embedder } : {}),
  };
}

describe('/buscar (búsqueda híbrida)', () => {
  it('encuentra por SIGNIFICADO lo que no coincide literalmente', async () => {
    // El caso que hacía que la web y Telegram dieran respuestas distintas a
    // la misma pregunta: "fontanero" no aparece en el texto de la nota.
    const pipeline = await pipelineCon(['Llamar al del agua para el grifo']);

    const reply = await handleSearchCommand('fontanero', 'ana', pipeline);

    expect(reply).toContain('Llamar al del agua');
  });

  it('las coincidencias literales van PRIMERO: una certeza no la desplaza una conjetura', async () => {
    const pipeline = await pipelineCon(['Llamar al del agua', 'Presupuesto del fontanero']);

    const reply = await handleSearchCommand('fontanero', 'ana', pipeline);

    expect(reply.indexOf('Presupuesto del fontanero')).toBeLessThan(reply.indexOf('Llamar al del agua'));
  });

  it('no repite una nota que ya salió por texto', async () => {
    const pipeline = await pipelineCon(['Presupuesto del fontanero']);

    const reply = await handleSearchCommand('fontanero', 'ana', pipeline);

    expect(reply.split('Presupuesto del fontanero')).toHaveLength(2);
  });

  it('sin embedder (sin GEMINI_API_KEY) se queda solo con el texto, no falla', async () => {
    const pipeline = await pipelineCon(['Llamar al del agua'], false);

    const reply = await handleSearchCommand('fontanero', 'ana', pipeline);

    expect(reply).toContain('No he encontrado nada');
  });

  it('si el embedder revienta, la búsqueda de texto sigue respondiendo', async () => {
    const pipeline = await pipelineCon(['Presupuesto del fontanero']);
    pipeline.embedder = {
      embedDocument: async () => null,
      embedQuery: async () => {
        throw new Error('Gemini caído');
      },
    };

    const reply = await handleSearchCommand('fontanero', 'ana', pipeline);

    expect(reply).toContain('Presupuesto del fontanero');
  });

  it('no cruza notas de otro usuario', async () => {
    const pipeline = await pipelineCon(['Llamar al del agua']);
    const ajena: StoredMessage = await pipeline.repository.save('bruno', {
      tipo: 'text',
      contenido: 'Secreto de bruno sobre el grifo',
      categoria: 'nota',
      resumen: 'Secreto de bruno sobre el grifo',
      embedding: vectorDe('grifo'),
    });

    const reply = await handleSearchCommand('fontanero', 'ana', pipeline);

    expect(reply).not.toContain(ajena.resumen);
  });
});
