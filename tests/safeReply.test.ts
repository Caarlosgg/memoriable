import { describe, expect, it, vi } from 'vitest';
import type { Context } from 'telegraf';
import { createMemoryLogger } from '../src/logging/logger.js';
import { sendSafeReply, splitForTelegram } from '../src/telegram/safeReply.js';

const LIMITE = 4096;

function fakeCtx(reply: ReturnType<typeof vi.fn>): Context {
  return { reply } as unknown as Context;
}

describe('splitForTelegram', () => {
  it('un texto corto se devuelve tal cual, sin trocear', () => {
    expect(splitForTelegram('hola')).toEqual(['hola']);
  });

  it('trocea por líneas cuando el texto supera el límite, sin partir ninguna línea', () => {
    const linea = 'a'.repeat(100);
    const texto = Array.from({ length: 50 }, () => linea).join('\n'); // ~5049 chars
    const partes = splitForTelegram(texto, LIMITE);

    expect(partes.length).toBeGreaterThan(1);
    for (const parte of partes) expect(parte.length).toBeLessThanOrEqual(LIMITE);
    expect(partes.join('\n')).toBe(texto);
  });

  it('respeta un límite personalizado (más fácil de probar que 4096 de verdad)', () => {
    const texto = 'uno\ndos\ntres\ncuatro';
    const partes = splitForTelegram(texto, 8);
    for (const parte of partes) expect(parte.length).toBeLessThanOrEqual(8);
    expect(partes.join('\n')).toBe(texto);
  });

  it('una sola línea más larga que el límite se trocea a lo bruto, sin perder contenido', () => {
    const lineaEnorme = 'x'.repeat(20);
    const partes = splitForTelegram(lineaEnorme, 8);

    for (const parte of partes) expect(parte.length).toBeLessThanOrEqual(8);
    expect(partes.join('')).toBe(lineaEnorme);
  });
});

describe('sendSafeReply', () => {
  it('un texto que cabe en un mensaje se manda tal cual, con HTML y el extra', async () => {
    const reply = vi.fn().mockResolvedValue({});
    const ctx = fakeCtx(reply);
    const extra = { reply_markup: { inline_keyboard: [] } };

    await sendSafeReply(ctx, 'hola', undefined, extra as never);

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('hola', { parse_mode: 'HTML', ...extra });
  });

  it('un texto largo se manda en varios mensajes; el extra solo va en el último', async () => {
    const reply = vi.fn().mockResolvedValue({});
    const ctx = fakeCtx(reply);
    const texto = Array.from({ length: 50 }, () => 'x'.repeat(100)).join('\n');
    const extra = { reply_markup: { inline_keyboard: [] } };

    await sendSafeReply(ctx, texto, undefined, extra as never);

    expect(reply.mock.calls.length).toBeGreaterThan(1);
    const ultimaLlamada = reply.mock.calls.at(-1)!;
    expect(ultimaLlamada[1]).toMatchObject(extra);
    for (const llamada of reply.mock.calls.slice(0, -1)) {
      expect(llamada[1]).not.toMatchObject(extra);
    }
  });

  it('si Telegram rechaza el HTML, reintenta el mismo fragmento en texto plano', async () => {
    const reply = vi
      .fn()
      .mockRejectedValueOnce(new Error("can't parse entities"))
      .mockResolvedValueOnce({});
    const ctx = fakeCtx(reply);
    const { logger, records } = createMemoryLogger();

    await sendSafeReply(ctx, 'texto con <problema>', logger);

    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply).toHaveBeenNthCalledWith(1, 'texto con <problema>', { parse_mode: 'HTML' });
    expect(reply).toHaveBeenNthCalledWith(2, 'texto con <problema>', undefined);
    expect(records.find((r) => r.event === 'telegram.reply_html_failed')).toBeDefined();
  });

  it('si ni el HTML ni el texto plano se entregan, manda un último aviso de error en vez de dejar al usuario sin nada', async () => {
    const reply = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom html'))
      .mockRejectedValueOnce(new Error('boom plano'))
      .mockResolvedValueOnce({});
    const ctx = fakeCtx(reply);
    const { logger, records } = createMemoryLogger();

    await sendSafeReply(ctx, 'algo', logger);

    expect(reply).toHaveBeenCalledTimes(3);
    expect(reply).toHaveBeenNthCalledWith(3, expect.stringMatching(/no he podido/i));
    expect(records.find((r) => r.event === 'telegram.reply_failed')).toBeDefined();
  });

  it('si un fragmento falla del todo, no sigue intentando enviar los fragmentos siguientes', async () => {
    const reply = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom html'))
      .mockRejectedValueOnce(new Error('boom plano'))
      .mockResolvedValueOnce({}); // el aviso de error final
    const ctx = fakeCtx(reply);
    const texto = Array.from({ length: 50 }, () => 'x'.repeat(100)).join('\n');

    await sendSafeReply(ctx, texto);

    // 2 intentos para el primer fragmento + 1 aviso de error = 3, nunca llega al segundo fragmento.
    expect(reply).toHaveBeenCalledTimes(3);
  });

  it('el último aviso de error nunca lanza, aunque también falle', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('todo falla'));
    const ctx = fakeCtx(reply);

    await expect(sendSafeReply(ctx, 'algo')).resolves.toBeUndefined();
  });
});
