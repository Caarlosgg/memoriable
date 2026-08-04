import { describe, expect, it, vi } from 'vitest';
import type { Categorizer, Embedder } from '../src/ai/types.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { createMemoryLogger } from '../src/logging/logger.js';
import { processMessage } from '../src/pipeline/processMessage.js';
import { InvalidMessageError, MAX_CONTENT_LENGTH } from '../src/pipeline/sanitize.js';

function stubCategorizer(categoria = 'tarea', resumen = 'Comprar pan'): Categorizer {
  return { analyze: vi.fn().mockResolvedValue({ categoria, resumen }) } as unknown as Categorizer;
}

function stubEmbedder(vector: number[] | null = [0.1, 0.2, 0.3]): Embedder {
  return {
    embedDocument: vi.fn().mockResolvedValue(vector),
    embedQuery: vi.fn().mockResolvedValue(vector),
  };
}

describe('processMessage', () => {
  it('categoriza y persiste el mensaje', async () => {
    const categorizer = stubCategorizer();
    const repository = new InMemoryMessageRepository();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'comprar pan' },
      'u1',
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
      processMessage({ tipo: 'text', contenido: 'x' }, 'u1', { categorizer, repository }),
    ).rejects.toThrow('fallo IA');
    expect(repository.all()).toHaveLength(0);
  });

  it('rechaza un mensaje vacío antes de llamar a la IA', async () => {
    const categorizer = stubCategorizer();
    const repository = new InMemoryMessageRepository();

    await expect(
      processMessage({ tipo: 'text', contenido: '   ' }, 'u1', { categorizer, repository }),
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
      'u1',
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
      'u1',
      { categorizer, repository, logger },
    );

    expect(stored.contenido.length).toBeLessThanOrEqual(MAX_CONTENT_LENGTH);
    expect(records.some((r) => r.event === 'message.truncated')).toBe(true);
  });

  it('registra un evento estructurado por mensaje procesado', async () => {
    const { logger, records } = createMemoryLogger();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'comprar pan' },
      'u1',
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
        'u1',
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

  it('genera y guarda el embedding cuando hay un embedder', async () => {
    const embedder = stubEmbedder([0.4, 0.5, 0.6]);
    const repository = new InMemoryMessageRepository();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'comprar pan' },
      'u1',
      { categorizer: stubCategorizer(), repository, embedder },
    );

    expect(embedder.embedDocument).toHaveBeenCalledWith('comprar pan');
    expect(stored.embedding).toEqual([0.4, 0.5, 0.6]);
  });

  it('guarda igual, sin embedding, si el embedder no puede generarlo', async () => {
    const embedder = stubEmbedder(null);
    const repository = new InMemoryMessageRepository();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'comprar pan' },
      'u1',
      { categorizer: stubCategorizer(), repository, embedder },
    );

    expect(stored.embedding).toBeNull();
  });

  it('guarda igual, sin embedding, si no hay embedder inyectado', async () => {
    const repository = new InMemoryMessageRepository();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'comprar pan' },
      'u1',
      { categorizer: stubCategorizer(), repository },
    );

    expect(stored.embedding).toBeNull();
  });

  it('registra el rechazo de un mensaje inválido', async () => {
    const { logger, records } = createMemoryLogger();

    await expect(
      processMessage(
        { tipo: 'text', contenido: '' },
        'u1',
        { categorizer: stubCategorizer(), repository: new InMemoryMessageRepository(), logger },
      ),
    ).rejects.toBeInstanceOf(InvalidMessageError);

    expect(records.find((r) => r.event === 'message.rejected')).toMatchObject({ reason: 'empty' });
  });

  it('avisa a onAnalysis del análisis completo sin cambiar si se guarda (Fase 6)', async () => {
    const categorizer: Categorizer = {
      analyze: vi.fn().mockResolvedValue({
        categoria: 'recordatorio',
        resumen: 'Llamar al médico',
        confianza: 0.4,
        preguntaAclaratoria: '¿Para qué día lo recuerdo?',
      }),
    };
    const repository = new InMemoryMessageRepository();
    const onAnalysis = vi.fn();

    const stored = await processMessage(
      { tipo: 'text', contenido: 'llamar al médico' },
      'u1',
      { categorizer, repository },
      onAnalysis,
    );

    expect(onAnalysis).toHaveBeenCalledWith({
      categoria: 'recordatorio',
      resumen: 'Llamar al médico',
      confianza: 0.4,
      preguntaAclaratoria: '¿Para qué día lo recuerdo?',
    });
    // El guardado nunca depende de onAnalysis: sucede igual, siempre.
    expect(stored.categoria).toBe('recordatorio');
    expect(repository.all()).toHaveLength(1);
  });
});
