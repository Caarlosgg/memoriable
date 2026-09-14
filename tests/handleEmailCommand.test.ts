import { describe, expect, it, vi } from 'vitest';
import { handleEmailCommand, REPLIES } from '../src/telegram/bot.js';
import type { SetEmailClient, SetEmailResult } from '../src/ai/setEmailClient.js';

function fakeClient(result: SetEmailResult): SetEmailClient {
  return { setEmail: vi.fn().mockResolvedValue(result) };
}

describe('handleEmailCommand', () => {
  it('sin correo, pide el uso', async () => {
    const reply = await handleEmailCommand('', 'u1', fakeClient({ ok: true }));
    expect(reply).toBe(REPLIES.emailUsage);
  });

  it('correo con formato inválido, no llega a llamar al cliente', async () => {
    const client = fakeClient({ ok: true });
    const reply = await handleEmailCommand('no-es-un-correo', 'u1', client);
    expect(reply).toBe(REPLIES.emailInvalido);
    expect(client.setEmail).not.toHaveBeenCalled();
  });

  it('éxito con correo enviado: confirma y menciona el correo', async () => {
    const client = fakeClient({ ok: true, enviado: true });
    const reply = await handleEmailCommand('Ana@Example.com', 'u1', client);
    expect(reply).toContain('ana@example.com');
    expect(client.setEmail).toHaveBeenCalledWith({ userId: 'u1', email: 'ana@example.com' });
  });

  it('cuenta guardada pero el correo no salió: avisa de que se guardó pero no llegó', async () => {
    const client = fakeClient({ ok: true, enviado: false });
    const reply = await handleEmailCommand('ana@example.com', 'u1', client);
    expect(reply).toBe(REPLIES.emailSinEnviar);
  });

  it('el servidor rechaza con un mensaje propio (p. ej. correo ya en uso): se muestra tal cual', async () => {
    const client = fakeClient({ ok: false, error: 'Ya hay una cuenta con ese correo.' });
    const reply = await handleEmailCommand('ana@example.com', 'u1', client);
    expect(reply).toBe('Ya hay una cuenta con ese correo.');
  });

  it('sin mensaje del servidor (cliente nulo o red caída), usa el aviso genérico', async () => {
    const client = fakeClient({ ok: false });
    const reply = await handleEmailCommand('ana@example.com', 'u1', client);
    expect(reply).toBe(REPLIES.emailNoDisponible);
  });

  it('si el cliente lanza, no propaga: responde el error genérico', async () => {
    const client: SetEmailClient = { setEmail: vi.fn().mockRejectedValue(new Error('boom')) };
    const reply = await handleEmailCommand('ana@example.com', 'u1', client);
    expect(reply).toBe(REPLIES.error);
  });
});
