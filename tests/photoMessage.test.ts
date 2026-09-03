import { describe, expect, it, vi } from 'vitest';
import { handlePhotoMessage, REPLIES } from '../src/telegram/bot.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { NullImageReader, type ImageReader } from '../src/ai/imageReader.js';
import type { Pipeline } from '../src/pipeline/processMessage.js';

function pipelineStub(): Pipeline {
  return {
    repository: new InMemoryMessageRepository(),
    categorizer: {
      analyze: vi.fn(async () => ({ categoria: 'nota' as const, resumen: 'Ticket del súper: 23,40 €' })),
    },
  };
}

function lectorQueDevuelve(texto: string | null): ImageReader {
  return { read: vi.fn(async () => texto) };
}

describe('handlePhotoMessage', () => {
  it('lo que lee de la foto sigue el MISMO camino que un texto: se categoriza y se guarda', async () => {
    const pipeline = pipelineStub();

    const result = await handlePhotoMessage(
      'https://telegram/foto.jpg',
      'ana',
      pipeline,
      lectorQueDevuelve('Ticket del súper 23,40 €'),
      undefined,
    );

    expect(result.saved).toBeDefined();
    expect(result.reply).toContain('Ticket del súper');
    expect(await pipeline.repository.findById('ana', result.saved!.id)).not.toBeNull();
  });

  it('el pie de foto viaja como CONTEXTO al lector, no como sustituto', async () => {
    // Quien escribe "factura de la luz" bajo la foto está diciendo qué es,
    // no qué pone — el texto real sigue saliendo de la imagen.
    const lector = lectorQueDevuelve('Iberdrola 84,20 €');
    await handlePhotoMessage('https://telegram/foto.jpg', 'ana', pipelineStub(), lector, 'factura de la luz');

    expect(lector.read).toHaveBeenCalledWith('https://telegram/foto.jpg', 'factura de la luz');
  });

  it('si no se puede leer la imagen, AVISA — que es justo lo que antes no pasaba', async () => {
    const pipeline = pipelineStub();

    const result = await handlePhotoMessage('https://telegram/foto.jpg', 'ana', pipeline, new NullImageReader(), undefined);

    expect(result.reply).toBe(REPLIES.photoFailed);
    expect(result.saved).toBeUndefined();
  });

  it('una lectura vacía cuenta como fallo, no se guarda una nota en blanco', async () => {
    const result = await handlePhotoMessage(
      'https://telegram/foto.jpg',
      'ana',
      pipelineStub(),
      lectorQueDevuelve(''),
      undefined,
    );

    expect(result.reply).toBe(REPLIES.photoFailed);
  });
});
