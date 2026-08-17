import { describe, expect, it, vi } from 'vitest';
import { GroqTranscriber, NullTranscriber, type GroqTranscriptionClient } from '../src/ai/transcriber.js';
import { createMemoryLogger } from '../src/logging/logger.js';

function mockClient(text: string): GroqTranscriptionClient {
  return { audio: { transcriptions: { create: vi.fn().mockResolvedValue({ text }) } } };
}

describe('GroqTranscriber', () => {
  it('transcribe y recorta el resultado', async () => {
    const client = mockClient('  Comprar pan y leche  ');
    const transcriber = new GroqTranscriber(client);
    const text = await transcriber.transcribe('https://example.com/audio.ogg');

    expect(text).toBe('Comprar pan y leche');
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith({
      url: 'https://example.com/audio.ogg',
      model: 'whisper-large-v3-turbo',
      language: 'es',
      response_format: 'json',
    });
  });

  it('devuelve null si la transcripción sale vacía', async () => {
    const transcriber = new GroqTranscriber(mockClient('   '));
    expect(await transcriber.transcribe('https://example.com/audio.ogg')).toBeNull();
  });

  it('nunca lanza: ante un fallo de la API, devuelve null y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const client: GroqTranscriptionClient = {
      audio: { transcriptions: { create: vi.fn().mockRejectedValue(new Error('timeout')) } },
    };
    const transcriber = new GroqTranscriber(client, logger);

    const text = await transcriber.transcribe('https://example.com/audio.ogg');

    expect(text).toBeNull();
    expect(records.find((r) => r.event === 'transcriber.failed')).toMatchObject({
      level: 'error',
      errorMessage: 'timeout',
    });
  });
});

describe('NullTranscriber', () => {
  it('siempre devuelve null, sin llamar a nada', async () => {
    expect(await new NullTranscriber().transcribe('https://example.com/audio.ogg')).toBeNull();
  });
});
