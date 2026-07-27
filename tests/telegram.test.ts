import { describe, expect, it } from 'vitest';
import { Telegraf } from 'telegraf';
import { OfflineCategorizer } from '../src/ai/offlineCategorizer.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { createBot, handleTextMessage } from '../src/telegram/bot.js';

const pipeline = {
  categorizer: new OfflineCategorizer(),
  repository: new InMemoryMessageRepository(),
};

describe('createBot', () => {
  it('devuelve null si falta el token (no bloquea el resto)', () => {
    expect(createBot(undefined, pipeline)).toBeNull();
    expect(createBot('', pipeline)).toBeNull();
  });

  it('crea una instancia de Telegraf si hay token', () => {
    const bot = createBot('123456:FAKE-TOKEN-PARA-TEST', pipeline);
    expect(bot).toBeInstanceOf(Telegraf);
  });

});

describe('handleTextMessage', () => {
  it('categoriza, persiste y devuelve la respuesta formateada', async () => {
    const repository = new InMemoryMessageRepository();
    const reply = await handleTextMessage('Comprar pan y leche', {
      categorizer: new OfflineCategorizer(),
      repository,
    });

    expect(reply).toContain('Categoría: tarea');
    expect(reply).toContain('Resumen:');
    expect(repository.all()).toHaveLength(1);
    expect(repository.all()[0]!.contenido).toBe('Comprar pan y leche');
  });
});
