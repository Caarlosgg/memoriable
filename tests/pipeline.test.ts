import { describe, expect, it, vi } from 'vitest';
import type { Categorizer } from '../src/ai/types.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { processMessage } from '../src/pipeline/processMessage.js';

describe('processMessage', () => {
  it('categoriza y persiste el mensaje', async () => {
    const categorizer: Categorizer = {
      analyze: vi.fn().mockResolvedValue({ categoria: 'tarea', resumen: 'Comprar pan' }),
    };
    const repository = new InMemoryMessageRepository();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'comprar pan' },
      { categorizer, repository },
    );

    expect(categorizer.analyze).toHaveBeenCalledOnce();
    expect(stored).toMatchObject({
      tipo: 'text',
      contenido: 'comprar pan',
      categoria: 'tarea',
      resumen: 'Comprar pan',
    });
    expect(stored.id).toBeTruthy();
    expect(repository.all()).toHaveLength(1);
  });

  it('propaga errores del categorizador (no persiste)', async () => {
    const categorizer: Categorizer = {
      analyze: vi.fn().mockRejectedValue(new Error('fallo IA')),
    };
    const repository = new InMemoryMessageRepository();

    await expect(
      processMessage({ tipo: 'text', contenido: 'x' }, { categorizer, repository }),
    ).rejects.toThrow('fallo IA');
    expect(repository.all()).toHaveLength(0);
  });
});
