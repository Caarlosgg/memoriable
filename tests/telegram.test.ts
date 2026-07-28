import { describe, expect, it, vi } from 'vitest';
import { Telegraf } from 'telegraf';
import { OfflineCategorizer } from '../src/ai/offlineCategorizer.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { createMemoryLogger } from '../src/logging/logger.js';
import type { Categorizer } from '../src/ai/types.js';
import {
  REPLIES,
  createBot,
  handleTextMessage,
  launchWithRetry,
} from '../src/telegram/bot.js';
import { describeTelegramError, isValidTokenFormat } from '../src/telegram/errors.js';

const TOKEN_VALIDO = '123456789:AAEabcdefghijklmnopqrstuvwxyz012345';

function pipeline() {
  return { categorizer: new OfflineCategorizer(), repository: new InMemoryMessageRepository() };
}

function telegramError(errorCode: number, message = 'error') {
  return Object.assign(new Error(message), { response: { error_code: errorCode } });
}

describe('isValidTokenFormat', () => {
  it('acepta el formato de @BotFather', () => {
    expect(isValidTokenFormat(TOKEN_VALIDO)).toBe(true);
  });

  it('rechaza tokens vacíos o mal formados', () => {
    for (const t of [undefined, '', 'sin-dos-puntos', '123:corto', 'abc:defghijklmnopqrstuvwxyz']) {
      expect(isValidTokenFormat(t)).toBe(false);
    }
  });
});

describe('describeTelegramError', () => {
  it('marca el token inválido como fatal y explica cómo arreglarlo', () => {
    const info = describeTelegramError(telegramError(401, 'Unauthorized'));
    expect(info).toMatchObject({ fatal: true, event: 'telegram.invalid_token' });
    expect(info.hint).toContain('TELEGRAM_BOT_TOKEN');
  });

  it('trata el conflicto de instancias (409) como recuperable pero explicado', () => {
    const info = describeTelegramError(telegramError(409));
    expect(info.fatal).toBe(false);
    expect(info.event).toBe('telegram.conflict');
    expect(info.hint).toContain('Otra instancia');
  });

  it('trata el rate limit (429) y los fallos de red como recuperables', () => {
    expect(describeTelegramError(telegramError(429))).toMatchObject({
      fatal: false,
      event: 'telegram.rate_limited',
    });
    expect(describeTelegramError(new Error('ECONNRESET'))).toMatchObject({
      fatal: false,
      event: 'telegram.network_error',
    });
  });
});

describe('createBot', () => {
  it('devuelve null si falta el token (no bloquea el resto)', () => {
    expect(createBot(undefined, pipeline())).toBeNull();
    expect(createBot('', pipeline())).toBeNull();
  });

  it('crea una instancia de Telegraf si hay token', () => {
    expect(createBot(TOKEN_VALIDO, pipeline())).toBeInstanceOf(Telegraf);
  });

  it('avisa si el token tiene un formato sospechoso, pero no aborta', () => {
    const { logger, records } = createMemoryLogger();
    const bot = createBot('token-raro', pipeline(), logger);

    expect(bot).toBeInstanceOf(Telegraf);
    expect(records.find((r) => r.event === 'telegram.token_format_suspicious')).toMatchObject({
      level: 'warn',
    });
  });
});

describe('handleTextMessage', () => {
  it('categoriza, persiste y devuelve la respuesta formateada', async () => {
    const repository = new InMemoryMessageRepository();
    const reply = await handleTextMessage('Comprar pan y leche', {
      categorizer: new OfflineCategorizer(),
      repository,
    });

    expect(reply).toContain('<b>Tarea</b>');
    expect(reply).toContain('🕒');
    expect(repository.all()).toHaveLength(1);
    expect(repository.all()[0]!.contenido).toBe('Comprar pan y leche');
  });

  it('responde con un mensaje amable si el texto está vacío', async () => {
    const reply = await handleTextMessage('   ', pipeline());
    expect(reply).toBe(REPLIES.empty);
  });

  it('nunca lanza: ante un fallo interno responde y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const categorizer: Categorizer = {
      analyze: vi.fn().mockRejectedValue(new Error('base de datos caída')),
    };

    const reply = await handleTextMessage(
      'hola',
      { categorizer, repository: new InMemoryMessageRepository(), logger },
      logger,
    );

    expect(reply).toBe(REPLIES.error);
    expect(records.find((r) => r.event === 'telegram.handler_failed')).toMatchObject({
      level: 'error',
      errorMessage: 'base de datos caída',
    });
  });
});

describe('launchWithRetry', () => {
  const sleeps: number[] = [];
  const fastSleep = async (ms: number) => {
    sleeps.push(ms);
  };

  it('devuelve "stopped" si el polling termina limpiamente', async () => {
    const { logger, records } = createMemoryLogger();
    const outcome = await launchWithRetry(async () => {}, { logger, sleep: fastSleep });

    expect(outcome).toBe('stopped');
    expect(records.find((r) => r.event === 'telegram.polling_stopped')).toBeDefined();
  });

  it('reconecta con backoff si el polling se cae por red', async () => {
    sleeps.length = 0;
    const { logger, records } = createMemoryLogger();
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(undefined);

    const outcome = await launchWithRetry(launch, { logger, sleep: fastSleep });

    expect(outcome).toBe('stopped');
    expect(launch).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]);
    expect(records.filter((r) => r.event === 'telegram.reconnecting')).toHaveLength(2);
  });

  it('no reintenta con un token inválido y explica la causa', async () => {
    const { logger, records } = createMemoryLogger();
    const launch = vi.fn().mockRejectedValue(telegramError(401, 'Unauthorized'));

    const outcome = await launchWithRetry(launch, { logger, sleep: fastSleep });

    expect(outcome).toBe('fatal');
    expect(launch).toHaveBeenCalledOnce();
    expect(records.find((r) => r.event === 'telegram.invalid_token')).toBeDefined();
    expect(records.find((r) => r.event === 'telegram.launch_aborted')).toBeDefined();
  });

  it('sí reintenta ante un conflicto de instancias (409)', async () => {
    const { logger } = createMemoryLogger();
    const launch = vi
      .fn()
      .mockRejectedValueOnce(telegramError(409))
      .mockResolvedValueOnce(undefined);

    expect(await launchWithRetry(launch, { logger, sleep: fastSleep })).toBe('stopped');
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('respeta el límite de reintentos configurado', async () => {
    const { logger, records } = createMemoryLogger();
    const launch = vi.fn().mockRejectedValue(new Error('red caída'));

    const outcome = await launchWithRetry(launch, { logger, sleep: fastSleep, retries: 2 });

    expect(outcome).toBe('exhausted');
    expect(launch).toHaveBeenCalledTimes(3); // intento inicial + 2 reintentos
    expect(records.find((r) => r.event === 'telegram.launch_exhausted')).toBeDefined();
  });

  it('acota el backoff al máximo configurado', async () => {
    sleeps.length = 0;
    const launch = vi.fn().mockRejectedValue(new Error('red caída'));

    await launchWithRetry(launch, {
      sleep: fastSleep,
      retries: 4,
      baseDelayMs: 1000,
      maxDelayMs: 3000,
    });

    expect(sleeps).toEqual([1000, 2000, 3000, 3000]);
  });
});
