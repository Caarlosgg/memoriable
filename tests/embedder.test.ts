import { describe, expect, it, vi } from 'vitest';
import { GeminiEmbedder, NullEmbedder } from '../src/ai/embedder.js';

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('NullEmbedder', () => {
  it('siempre devuelve null, para ambos métodos', async () => {
    const embedder = new NullEmbedder();
    expect(await embedder.embedDocument('x')).toBeNull();
    expect(await embedder.embedQuery('x')).toBeNull();
  });
});

describe('GeminiEmbedder', () => {
  it('devuelve el vector de la respuesta (forma singular "embedding")', async () => {
    const fetchFn = fakeFetch({ embedding: { values: [0.1, 0.2, 0.3] } });
    const embedder = new GeminiEmbedder('fake-key', { fetchFn });

    const result = await embedder.embedDocument('hola mundo');

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('gemini-embedding-001:embedContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('fake-key');
    const body = JSON.parse(init.body as string);
    expect(body.taskType).toBe('RETRIEVAL_DOCUMENT');
    expect(body.outputDimensionality).toBe(768);
    expect(body.content.parts[0].text).toBe('hola mundo');
  });

  it('usa RETRIEVAL_QUERY para embedQuery (distinto de embedDocument)', async () => {
    const fetchFn = fakeFetch({ embedding: { values: [0.1] } });
    const embedder = new GeminiEmbedder('fake-key', { fetchFn });

    await embedder.embedQuery('¿qué tengo pendiente?');

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.taskType).toBe('RETRIEVAL_QUERY');
  });

  it('acepta también la forma plural "embeddings" (batch-like)', async () => {
    const fetchFn = fakeFetch({ embeddings: [{ values: [0.9, 0.8] }] });
    const embedder = new GeminiEmbedder('fake-key', { fetchFn });

    expect(await embedder.embedDocument('x')).toEqual([0.9, 0.8]);
  });

  it('devuelve null (no lanza) si la API responde con error HTTP', async () => {
    const onWarning = vi.fn();
    const fetchFn = fakeFetch({ error: 'nope' }, false, 429);
    const embedder = new GeminiEmbedder('fake-key', { fetchFn, onWarning });

    const result = await embedder.embedDocument('x');

    expect(result).toBeNull();
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it('devuelve null (no lanza) si la respuesta no trae un vector válido', async () => {
    const fetchFn = fakeFetch({ embedding: {} });
    const embedder = new GeminiEmbedder('fake-key', { fetchFn });

    expect(await embedder.embedDocument('x')).toBeNull();
  });

  it('devuelve null (no lanza) ante un fallo de red', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;
    const onWarning = vi.fn();
    const embedder = new GeminiEmbedder('fake-key', { fetchFn, onWarning });

    const result = await embedder.embedDocument('x');

    expect(result).toBeNull();
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it('respeta un output_dimensionality y modelo personalizados', async () => {
    const fetchFn = fakeFetch({ embedding: { values: [1] } });
    const embedder = new GeminiEmbedder('fake-key', {
      fetchFn,
      model: 'otro-modelo',
      outputDimensionality: 256,
    });

    await embedder.embedDocument('x');

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('otro-modelo:embedContent');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.outputDimensionality).toBe(256);
  });
});
