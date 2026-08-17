import { describe, expect, it, vi } from 'vitest';
import { Telegraf } from 'telegraf';
import { OfflineCategorizer } from '../src/ai/offlineCategorizer.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { createMemoryLogger } from '../src/logging/logger.js';
import type { Categorizer } from '../src/ai/types.js';
import {
  BOT_COMMANDS,
  REPLIES,
  briefingKeyboard,
  commandArgument,
  createBot,
  handleBriefingCommand,
  handleLinkCommand,
  handlePendingCommand,
  handleSearchCommand,
  handleTextMessage,
  handleVoiceMessage,
  launchWithRetry,
  registerCommands,
  tryAnswerFocus,
} from '../src/telegram/bot.js';
import type { Transcriber } from '../src/ai/transcriber.js';
import { createLinkAttemptLimiter } from '../src/telegram/linkRateLimit.js';
import { describeTelegramError, isValidTokenFormat } from '../src/telegram/errors.js';
import { InMemoryFocusStateStore } from '../src/summary/focusState.js';
import { InMemoryEventRepository } from '../src/db/eventRepository.js';
import type { BriefingGenerator } from '../src/ai/briefing.js';

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
    const { reply, followUp } = await handleTextMessage('Comprar pan y leche', 'u1', {
      categorizer: new OfflineCategorizer(),
      repository,
    });

    expect(reply).toContain('<b>Tarea</b>');
    expect(reply).toContain('🕒');
    expect(followUp).toBeUndefined();
    expect(repository.all()).toHaveLength(1);
    expect(repository.all()[0]!.contenido).toBe('Comprar pan y leche');
  });

  it('responde con un mensaje amable si el texto está vacío', async () => {
    const { reply } = await handleTextMessage('   ', 'u1', pipeline());
    expect(reply).toBe(REPLIES.empty);
  });

  it('nunca lanza: ante un fallo interno responde y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const categorizer: Categorizer = {
      analyze: vi.fn().mockRejectedValue(new Error('base de datos caída')),
    };

    const { reply } = await handleTextMessage(
      'hola',
      'u1',
      { categorizer, repository: new InMemoryMessageRepository(), logger },
      logger,
    );

    expect(reply).toBe(REPLIES.error);
    expect(records.find((r) => r.event === 'telegram.handler_failed')).toMatchObject({
      level: 'error',
      errorMessage: 'base de datos caída',
    });
  });

  it('manda una pregunta de seguimiento aparte cuando el categorizador la pide', async () => {
    const repository = new InMemoryMessageRepository();
    const categorizer: Categorizer = {
      analyze: vi.fn().mockResolvedValue({
        categoria: 'recordatorio',
        resumen: 'Llamar al médico',
        confianza: 0.4,
        preguntaAclaratoria: '¿Para qué día lo recuerdo?',
      }),
    };

    const { reply, followUp } = await handleTextMessage('Llamar al médico', 'u1', { categorizer, repository });

    expect(reply).toContain('Llamar al médico');
    expect(followUp).toBe('¿Para qué día lo recuerdo?');
    // Nunca bloquea el guardado: se guarda igual, con la mejor categoría posible.
    expect(repository.all()).toHaveLength(1);
  });
});

describe('handleVoiceMessage', () => {
  function fakeTranscriber(text: string | null): Transcriber {
    return { transcribe: vi.fn().mockResolvedValue(text) };
  }

  it('transcribe y sigue el mismo camino que un mensaje de texto', async () => {
    const repository = new InMemoryMessageRepository();
    const transcriber = fakeTranscriber('Comprar pan y leche');
    const { reply, followUp } = await handleVoiceMessage(
      'https://api.telegram.org/file/bot123/voice.ogg',
      'u1',
      { categorizer: new OfflineCategorizer(), repository },
      transcriber,
    );

    expect(transcriber.transcribe).toHaveBeenCalledWith('https://api.telegram.org/file/bot123/voice.ogg');
    expect(reply).toContain('<b>Tarea</b>');
    expect(followUp).toBeUndefined();
    expect(repository.all()).toHaveLength(1);
    expect(repository.all()[0]!.contenido).toBe('Comprar pan y leche');
  });

  it('si no se puede transcribir, avisa en vez de fallar en silencio', async () => {
    const repository = new InMemoryMessageRepository();
    const { reply } = await handleVoiceMessage(
      'https://api.telegram.org/file/bot123/voice.ogg',
      'u1',
      { categorizer: new OfflineCategorizer(), repository },
      fakeTranscriber(null),
    );

    expect(reply).toBe(REPLIES.voiceFailed);
    expect(repository.all()).toHaveLength(0);
  });
});

describe('tryAnswerFocus', () => {
  const now = new Date(2026, 6, 29, 10, 0); // 29 jul

  it('sin focusStore, no hace nada (compatible con el bot sin ese estado)', () => {
    expect(tryAnswerFocus(undefined, 123, 'Pagar la luz', now)).toBeNull();
  });

  it('sin ninguna marca para ese chat, no hace nada', () => {
    const store = new InMemoryFocusStateStore();
    expect(tryAnswerFocus(store, 123, 'Pagar la luz', now)).toBeNull();
  });

  it('si ya se contestó (awaitingAnswer=false), no vuelve a interceptar', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(123, '2026-07-29');
    store.setAnswer(123, '2026-07-29', 'Ya contestado');
    expect(tryAnswerFocus(store, 123, 'Otra cosa', now)).toBeNull();
  });

  it('si la marca es de OTRO día (p. ej. de ayer, nunca contestada), no la intercepta', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(123, '2026-07-28');
    expect(tryAnswerFocus(store, 123, 'Pagar la luz', now)).toBeNull();
  });

  it('esperando respuesta de HOY, la consume: guarda el texto y confirma', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(123, '2026-07-29');

    const reply = tryAnswerFocus(store, 123, '  Pagar la luz  ', now);

    expect(reply).toContain('Pagar la luz');
    expect(store.get(123)).toEqual({ day: '2026-07-29', awaitingAnswer: false, text: 'Pagar la luz' });
  });

  it('escapa HTML en la respuesta (el texto viene del usuario, se manda con parse_mode HTML)', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(123, '2026-07-29');
    const reply = tryAnswerFocus(store, 123, '<script>alert(1)</script>', now);
    expect(reply).not.toContain('<script>');
    expect(reply).toContain('&lt;script&gt;');
  });

  it('un texto vacío no cuenta como respuesta (deja la marca intacta)', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(123, '2026-07-29');
    expect(tryAnswerFocus(store, 123, '   ', now)).toBeNull();
    expect(store.get(123)).toEqual({ day: '2026-07-29', awaitingAnswer: true });
  });
});

describe('commandArgument', () => {
  it('quita el token del comando y recorta el resto', () => {
    expect(commandArgument('/buscar factura luz')).toBe('factura luz');
    expect(commandArgument('/buscar@mi_bot   café  ')).toBe('café');
  });

  it('devuelve cadena vacía si el comando no lleva argumento', () => {
    expect(commandArgument('/buscar')).toBe('');
    expect(commandArgument('/buscar   ')).toBe('');
  });
});

describe('handleSearchCommand', () => {
  it('pide un término si la consulta viene vacía', async () => {
    const reply = await handleSearchCommand('   ', 'u1', pipeline());
    expect(reply).toBe(REPLIES.searchUsage);
  });

  it('devuelve las coincidencias como tarjetas', async () => {
    const repository = new InMemoryMessageRepository();
    await handleTextMessage('Comprar pan y leche', 'u1', {
      categorizer: new OfflineCategorizer(),
      repository,
    });

    const reply = await handleSearchCommand('pan', 'u1', { categorizer: new OfflineCategorizer(), repository });
    expect(reply).toContain('Resultados para «pan»');
    expect(reply).toContain('<b>Tarea</b>');
  });

  it('dice con naturalidad que no hay resultados', async () => {
    const reply = await handleSearchCommand('inexistente', 'u1', pipeline());
    expect(reply).toContain('No he encontrado nada');
  });

  it('nunca lanza: ante un fallo del repositorio responde error y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const repository = {
      save: vi.fn(),
      search: vi.fn().mockRejectedValue(new Error('db caída')),
      pending: vi.fn(),
      savedBetween: vi.fn(),
    };

    const reply = await handleSearchCommand(
      'algo',
      'u1',
      { categorizer: new OfflineCategorizer(), repository, logger },
      logger,
    );

    expect(reply).toBe(REPLIES.error);
    expect(records.find((r) => r.event === 'telegram.search_failed')).toMatchObject({
      level: 'error',
    });
  });
});

describe('handlePendingCommand', () => {
  it('lista las tareas/recordatorios pendientes como tarjetas', async () => {
    const repository = new InMemoryMessageRepository();
    const pipeline = { categorizer: new OfflineCategorizer(), repository };
    await handleTextMessage('Comprar pan y leche', 'u1', pipeline);

    const reply = await handlePendingCommand('u1', pipeline);
    expect(reply).toContain('Tus pendientes');
    expect(reply).toContain('<b>Tarea</b>');
  });

  it('dice con naturalidad que no hay nada pendiente', async () => {
    const reply = await handlePendingCommand('u1', pipeline());
    expect(reply).toBe(REPLIES.noPending);
  });

  it('nunca lanza: ante un fallo del repositorio responde error y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const repository = {
      save: vi.fn(),
      search: vi.fn(),
      pending: vi.fn().mockRejectedValue(new Error('db caída')),
      savedBetween: vi.fn(),
    };

    const reply = await handlePendingCommand(
      'u1',
      { categorizer: new OfflineCategorizer(), repository, logger },
      logger,
    );

    expect(reply).toBe(REPLIES.error);
    expect(records.find((r) => r.event === 'telegram.pending_failed')).toMatchObject({
      level: 'error',
    });
  });
});

describe('briefingKeyboard', () => {
  it('trae los dos botones de acción', () => {
    const { reply_markup } = briefingKeyboard();
    const labels = reply_markup.inline_keyboard.flat().map((b) => b.text);
    expect(labels).toEqual(['🔁 Actualizar', '📋 Ver pendientes']);
  });
});

describe('handleBriefingCommand', () => {
  it('compone el resumen (delegando en buildDailySummary) para el usuario dado', async () => {
    const repository = new InMemoryMessageRepository();
    // "Llamar al banco" cae en 'tarea' por la heurística offline (ver
    // offlineCategorizer.ts) — "Pagar la luz" no matchea ningún verbo y
    // caería en 'nota', que no aparece en pendientes.
    await handleTextMessage('Llamar al banco', 'u1', { categorizer: new OfflineCategorizer(), repository });

    const reply = await handleBriefingCommand('u1', { categorizer: new OfflineCategorizer(), repository }, undefined, undefined);

    expect(reply).toContain('Resumen diario');
    expect(reply).toContain('Llamar al banco');
  });

  it('incluye eventos de hoy cuando se le da un eventRepository', async () => {
    const repository = new InMemoryMessageRepository();
    const eventRepository = new InMemoryEventRepository([{ titulo: 'Cita médica', fechaInicio: new Date() }]);

    const reply = await handleBriefingCommand(
      'u1',
      { categorizer: new OfflineCategorizer(), repository },
      eventRepository,
      undefined,
    );

    // Sin briefingGenerator, el evento de hoy no aparece en el texto plano
    // (esa sección solo la compone el consultor) — pero no debe lanzar ni
    // fallar por tener un eventRepository sin generador.
    expect(reply).toContain('Resumen diario');
  });

  it('con briefingGenerator, incluye la sección del consultor', async () => {
    const repository = new InMemoryMessageRepository();
    const briefingGenerator: BriefingGenerator = {
      generate: vi.fn().mockResolvedValue({
        misionPrincipal: 'Pagar la luz',
        bloqueManana: ['Pagar la luz'],
        bloqueTarde: [],
        advertencias: [],
      }),
    };

    const reply = await handleBriefingCommand(
      'u1',
      { categorizer: new OfflineCategorizer(), repository },
      undefined,
      briefingGenerator,
    );

    expect(reply).toContain('Misión principal');
    expect(reply).toContain('Pagar la luz');
  });

  it('nunca lanza: ante un fallo interno responde error y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const repository = {
      save: vi.fn(),
      search: vi.fn(),
      pending: vi.fn().mockRejectedValue(new Error('db caída')),
      savedBetween: vi.fn(),
    };

    const reply = await handleBriefingCommand(
      'u1',
      { categorizer: new OfflineCategorizer(), repository, logger },
      undefined,
      undefined,
      logger,
    );

    expect(reply).toBe(REPLIES.error);
    expect(records.find((r) => r.event === 'telegram.briefing_failed')).toMatchObject({ level: 'error' });
  });
});

describe('handleLinkCommand', () => {
  it('pide el código si viene vacío', async () => {
    const linkChat = vi.fn();
    const reply = await handleLinkCommand('   ', 123, linkChat, undefined, createLinkAttemptLimiter());
    expect(reply).toBe(REPLIES.linkUsage);
    expect(linkChat).not.toHaveBeenCalled();
  });

  it('confirma cuando el código es válido', async () => {
    const linkChat = vi.fn().mockResolvedValue('linked');
    const reply = await handleLinkCommand('123456', 987, linkChat, undefined, createLinkAttemptLimiter());
    expect(reply).toBe(REPLIES.linkSuccess);
    expect(linkChat).toHaveBeenCalledWith('123456', 987);
  });

  it('avisa con naturalidad si el código no es válido o caducó', async () => {
    const linkChat = vi.fn().mockResolvedValue('invalid_or_expired');
    const reply = await handleLinkCommand('000000', 987, linkChat, undefined, createLinkAttemptLimiter());
    expect(reply).toBe(REPLIES.linkInvalid);
  });

  it('nunca lanza: ante un fallo interno responde error y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const linkChat = vi.fn().mockRejectedValue(new Error('db caída'));

    const reply = await handleLinkCommand('123456', 987, linkChat, logger, createLinkAttemptLimiter());

    expect(reply).toBe(REPLIES.error);
    expect(records.find((r) => r.event === 'telegram.link_failed')).toMatchObject({ level: 'error' });
  });

  it('bloquea tras varios códigos incorrectos seguidos, sin volver a consultar la BD', async () => {
    const linkChat = vi.fn().mockResolvedValue('invalid_or_expired');
    const limiter = createLinkAttemptLimiter(3, 10 * 60 * 1000);

    for (let i = 0; i < 3; i++) {
      const reply = await handleLinkCommand('000000', 555, linkChat, undefined, limiter);
      expect(reply).toBe(REPLIES.linkInvalid);
    }

    const blockedReply = await handleLinkCommand('000000', 555, linkChat, undefined, limiter);
    expect(blockedReply).toBe(REPLIES.linkRateLimited);
    expect(linkChat).toHaveBeenCalledTimes(3);
  });

  it('un código correcto limpia los fallos anteriores', async () => {
    const linkChat = vi.fn().mockResolvedValueOnce('invalid_or_expired').mockResolvedValueOnce('linked');
    const limiter = createLinkAttemptLimiter(2, 10 * 60 * 1000);

    await handleLinkCommand('000000', 321, linkChat, undefined, limiter);
    const reply = await handleLinkCommand('123456', 321, linkChat, undefined, limiter);
    expect(reply).toBe(REPLIES.linkSuccess);
    expect(limiter.isBlocked(321)).toBe(false);
  });

  it('no cuenta un fallo si la BD no está disponible (no_database)', async () => {
    const linkChat = vi.fn().mockResolvedValue('no_database');
    const limiter = createLinkAttemptLimiter(1, 10 * 60 * 1000);

    await handleLinkCommand('123456', 741, linkChat, undefined, limiter);
    expect(limiter.isBlocked(741)).toBe(false);
  });
});

describe('registerCommands', () => {
  it('el menú incluye al menos /buscar y /pendientes', () => {
    const names = BOT_COMMANDS.map((c) => c.command);
    expect(names).toContain('buscar');
    expect(names).toContain('pendientes');
  });

  it('publica el menú vía setMyCommands y lo registra', async () => {
    const { logger, records } = createMemoryLogger();
    const setMyCommands = vi.fn().mockResolvedValue(true);

    await registerCommands({ telegram: { setMyCommands } } as never, logger);

    expect(setMyCommands).toHaveBeenCalledWith([...BOT_COMMANDS]);
    expect(records.find((r) => r.event === 'telegram.commands_registered')).toMatchObject({
      level: 'info',
    });
  });

  it('nunca lanza: si la API falla, avisa pero no rompe', async () => {
    const { logger, records } = createMemoryLogger();
    const setMyCommands = vi.fn().mockRejectedValue(new Error('API caída'));

    await expect(
      registerCommands({ telegram: { setMyCommands } } as never, logger),
    ).resolves.toBeUndefined();
    expect(records.find((r) => r.event === 'telegram.commands_register_failed')).toMatchObject({
      level: 'warn',
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
