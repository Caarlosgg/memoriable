import { describe, expect, it, vi } from 'vitest';
import { createMemoryLogger } from '../src/logging/logger.js';
import { handleEspacioCommand, handleEspacioChoice, REPLIES } from '../src/telegram/bot.js';
import type { BotWorkspace } from '../src/db/workspaces.js';

const PERSONAL: BotWorkspace = { id: 'ws-personal', nombre: 'Mi espacio', personal: true, role: 'OWNER' };
const EQUIPO: BotWorkspace = { id: 'ws-equipo', nombre: 'Obrador', personal: false, role: 'MEMBER' };

describe('handleEspacioCommand', () => {
  it('con un solo espacio no monta un selector de un botón: explica lo que hay', async () => {
    const result = await handleEspacioCommand(
      'u1',
      undefined,
      async () => [PERSONAL],
      async () => PERSONAL,
    );
    expect(result.text).toBe(REPLIES.espacioSolo);
    expect(result.keyboard).toBeUndefined();
  });

  it('dice dónde está guardando AHORA y ofrece el selector', async () => {
    const result = await handleEspacioCommand(
      'u1',
      undefined,
      async () => [PERSONAL, EQUIPO],
      async () => EQUIPO,
    );
    expect(result.text).toContain('Obrador');
    expect(result.keyboard).toBeDefined();
  });

  it('marca con • el espacio activo, para responder también a "¿dónde estoy escribiendo?"', async () => {
    const result = await handleEspacioCommand(
      'u1',
      undefined,
      async () => [PERSONAL, EQUIPO],
      async () => EQUIPO,
    );
    const botones = result.keyboard!.reply_markup.inline_keyboard.flat();
    expect(botones.find((b) => b.text.includes('Obrador'))!.text).toContain('•');
    expect(botones.find((b) => b.text.includes('Mi espacio'))!.text).not.toContain('•');
  });

  it('escapa HTML del nombre del espacio (lo escribe el usuario al crear el equipo)', async () => {
    const result = await handleEspacioCommand(
      'u1',
      undefined,
      async () => [PERSONAL, EQUIPO],
      async () => ({ ...EQUIPO, nombre: '<b>x</b>' }),
    );
    expect(result.text).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('nunca lanza: un fallo de base de datos responde con el aviso genérico', async () => {
    const { logger, records } = createMemoryLogger();
    const result = await handleEspacioCommand(
      'u1',
      logger,
      async () => {
        throw new Error('BD caída');
      },
      async () => PERSONAL,
    );
    expect(result.text).toBe(REPLIES.error);
    expect(records.some((r) => r.event === 'telegram.espacio_failed')).toBe(true);
  });
});

describe('handleEspacioChoice', () => {
  it('confirma diciendo el nombre del espacio elegido', async () => {
    const text = await handleEspacioChoice(
      'u1',
      'ws-equipo',
      undefined,
      async () => 'ok',
      async () => EQUIPO,
    );
    expect(text).toContain('Obrador');
  });

  it('rechaza un espacio del que ya no eres miembro sin cambiar nada', async () => {
    const fijar = vi.fn(async () => 'no_member' as const);
    const resolver = vi.fn(async () => PERSONAL);
    const text = await handleEspacioChoice('u1', 'ws-ajeno', undefined, fijar, resolver);
    expect(text).toBe(REPLIES.espacioNoMiembro);
    // No se llega a releer el espacio activo: no ha cambiado nada.
    expect(resolver).not.toHaveBeenCalled();
  });

  it('nunca lanza ante un fallo interno', async () => {
    const { logger, records } = createMemoryLogger();
    const text = await handleEspacioChoice(
      'u1',
      'ws-equipo',
      logger,
      async () => {
        throw new Error('BD caída');
      },
      async () => PERSONAL,
    );
    expect(text).toBe(REPLIES.error);
    expect(records.some((r) => r.event === 'telegram.espacio_choice_failed')).toBe(true);
  });
});
