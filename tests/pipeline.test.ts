import { describe, expect, it, vi } from 'vitest';
import type { Categorizer } from '../src/ai/types.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { createMemoryLogger } from '../src/logging/logger.js';
import { processMessage } from '../src/pipeline/processMessage.js';
import { InvalidMessageError, MAX_CONTENT_LENGTH } from '../src/pipeline/sanitize.js';

function stubCategorizer(categoria = 'tarea', resumen = 'Comprar pan'): Categorizer {
  return { analyze: vi.fn().mockResolvedValue({ categoria, resumen }) } as unknown as Categorizer;
}

describe('processMessage', () => {
  it('categoriza y persiste el mensaje', async () => {
    const categorizer = stubCategorizer();
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

  it('rechaza un mensaje vacío antes de llamar a la IA', async () => {
    const categorizer = stubCategorizer();
    const repository = new InMemoryMessageRepository();

    await expect(
      processMessage({ tipo: 'text', contenido: '   ' }, { categorizer, repository }),
    ).rejects.toBeInstanceOf(InvalidMessageError);

    // Clave para el coste: no se gasta ni una llamada a la API.
    expect(categorizer.analyze).not.toHaveBeenCalled();
    expect(repository.all()).toHaveLength(0);
  });

  it('sanea el contenido antes de analizarlo y guardarlo', async () => {
    const categorizer = stubCategorizer('nota', 'resumen');
    const repository = new InMemoryMessageRepository();
    const NUL = String.fromCharCode(0x00);

    const stored = await processMessage(
      { tipo: 'text', contenido: `  hola${NUL}   mundo  ` },
      { categorizer, repository },
    );

    expect(stored.contenido).toBe('hola mundo');
    const analizado = (categorizer.analyze as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(analizado.contenido).toBe('hola mundo');
  });

  it('trunca un mensaje gigante y lo registra', async () => {
    const categorizer = stubCategorizer('nota', 'resumen');
    const repository = new InMemoryMessageRepository();
    const { logger, records } = createMemoryLogger();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'a'.repeat(50_000) },
      { categorizer, repository, logger },
    );

    expect(stored.contenido.length).toBeLessThanOrEqual(MAX_CONTENT_LENGTH);
    expect(records.some((r) => r.event === 'message.truncated')).toBe(true);
  });

  it('registra un evento estructurado por mensaje procesado', async () => {
    const { logger, records } = createMemoryLogger();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'comprar pan' },
      { categorizer: stubCategorizer(), repository: new InMemoryMessageRepository(), logger },
    );

    const procesado = records.find((r) => r.event === 'message.processed');
    expect(procesado).toMatchObject({ level: 'info', categoria: 'tarea', id: stored.id });
    expect(typeof procesado?.durationMs).toBe('number');
    expect(typeof procesado?.ts).toBe('string');
  });

  it('registra el fallo con contexto suficiente para depurar', async () => {
    const { logger, records } = createMemoryLogger();
    const categorizer: Categorizer = {
      analyze: vi.fn().mockRejectedValue(Object.assign(new Error('API caída'), { status: 500 })),
    };

    await expect(
      processMessage(
        { tipo: 'text', contenido: 'hola' },
        { categorizer, repository: new InMemoryMessageRepository(), logger },
      ),
    ).rejects.toThrow('API caída');

    const fallo = records.find((r) => r.event === 'message.failed');
    expect(fallo).toMatchObject({
      level: 'error',
      errorMessage: 'API caída',
      errorStatus: 500,
    });
  });

  it('registra el rechazo de un mensaje inválido', async () => {
    const { logger, records } = createMemoryLogger();

    await expect(
      processMessage(
        { tipo: 'text', contenido: '' },
        { categorizer: stubCategorizer(), repository: new InMemoryMessageRepository(), logger },
      ),
    ).rejects.toBeInstanceOf(InvalidMessageError);

    expect(records.find((r) => r.event === 'message.rejected')).toMatchObject({ reason: 'empty' });
  });
});
