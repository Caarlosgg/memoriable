import { describe, expect, it, vi } from 'vitest';
import {
  buildDailySummary,
  dayKey,
  formatDailySummary,
  isAtOrAfterHour,
  runDailySummaryTick,
  yesterdayRange,
} from '../src/summary/dailySummary.js';
import { InMemorySummaryStateStore } from '../src/summary/summaryState.js';
import type { MessageRepository, StoredMessage } from '../src/db/repository.js';

function msg(overrides: Partial<StoredMessage> & { id: string }): StoredMessage {
  return {
    tipo: 'text',
    contenido: '',
    categoria: 'tarea',
    resumen: '',
    hecho: false,
    fecha: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'u1',
    ...overrides,
  };
}

/** Repositorio de prueba con datos fijos y espías sobre pending/savedBetween. */
function fakeRepo(pending: StoredMessage[], saved: StoredMessage[]) {
  return {
    save: vi.fn(),
    search: vi.fn(),
    pending: vi.fn().mockResolvedValue(pending),
    savedBetween: vi.fn().mockResolvedValue(saved),
  } satisfies MessageRepository;
}

describe('dayKey', () => {
  it('formatea la fecha local como YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 6, 29, 9, 30))).toBe('2026-07-29');
    expect(dayKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
});

describe('yesterdayRange', () => {
  it('devuelve el día natural anterior, de medianoche a medianoche', () => {
    const now = new Date(2026, 6, 29, 9, 0); // 29 jul 09:00 local
    const { from, to } = yesterdayRange(now);
    expect(from).toEqual(new Date(2026, 6, 28, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 6, 29, 0, 0, 0, 0));
  });

  it('cruza bien el cambio de mes', () => {
    const { from, to } = yesterdayRange(new Date(2026, 7, 1, 10, 0)); // 1 ago
    expect(from).toEqual(new Date(2026, 6, 31, 0, 0));
    expect(to).toEqual(new Date(2026, 7, 1, 0, 0));
  });

  it('un mensaje de ayer cae dentro y uno de hoy/anteayer fuera', () => {
    const now = new Date(2026, 6, 29, 9, 0);
    const { from, to } = yesterdayRange(now);
    const ayer = new Date(2026, 6, 28, 15, 0);
    const hoy = new Date(2026, 6, 29, 1, 0);
    const anteayer = new Date(2026, 6, 27, 23, 0);
    expect(ayer >= from && ayer < to).toBe(true);
    expect(hoy >= from && hoy < to).toBe(false);
    expect(anteayer >= from && anteayer < to).toBe(false);
  });
});

describe('isAtOrAfterHour', () => {
  it('true a partir de la hora, false antes', () => {
    expect(isAtOrAfterHour(new Date(2026, 6, 29, 9, 0), 9)).toBe(true);
    expect(isAtOrAfterHour(new Date(2026, 6, 29, 11, 30), 9)).toBe(true);
    expect(isAtOrAfterHour(new Date(2026, 6, 29, 8, 59), 9)).toBe(false);
  });
});

describe('buildDailySummary', () => {
  it('pide a savedBetween exactamente el rango de ayer', async () => {
    const now = new Date(2026, 6, 29, 9, 0);
    const repo = fakeRepo([], []);
    await buildDailySummary(repo, 'u1', now);
    expect(repo.savedBetween).toHaveBeenCalledWith(
      'u1',
      new Date(2026, 6, 28, 0, 0),
      new Date(2026, 6, 29, 0, 0),
    );
    expect(repo.pending).toHaveBeenCalledOnce();
  });

  it('incluye pendientes y lo de ayer como tarjetas', async () => {
    const now = new Date(2026, 6, 29, 9, 0);
    const repo = fakeRepo(
      [msg({ id: 'p', categoria: 'tarea', resumen: 'Pagar la luz' })],
      [msg({ id: 's', categoria: 'nota', resumen: 'Cena con Marta' })],
    );
    const text = await buildDailySummary(repo, 'u1', now);
    expect(text).toContain('Pendientes');
    expect(text).toContain('Pagar la luz');
    expect(text).toContain('Guardado ayer');
    expect(text).toContain('Cena con Marta');
  });
});

describe('formatDailySummary', () => {
  it('muestra notas amables cuando no hay nada', () => {
    const text = formatDailySummary({ pending: [], savedYesterday: [], now: new Date(2026, 6, 29) });
    expect(text).toContain('No tienes nada pendiente');
    expect(text).toContain('Ayer no guardaste nada');
  });
});

describe('runDailySummaryTick', () => {
  const now = () => new Date(2026, 6, 29, 9, 0); // 29 jul 09:00, hora >= 9

  it('no envía antes de la hora configurada', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new InMemorySummaryStateStore();
    const result = await runDailySummaryTick({
      repository: fakeRepo([], []),
      userId: 'u1',
      store,
      send,
      hour: 9,
      now: () => new Date(2026, 6, 29, 8, 0),
    });
    expect(result).toBe('before_hour');
    expect(send).not.toHaveBeenCalled();
    expect(store.lastSentDay()).toBeUndefined();
  });

  it('envía y marca el día cuando procede', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new InMemorySummaryStateStore();
    const result = await runDailySummaryTick({
      repository: fakeRepo([], []),
      userId: 'u1',
      store,
      send,
      hour: 9,
      now,
    });
    expect(result).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
    expect(store.lastSentDay()).toBe('2026-07-29');
  });

  it('no reenvía si ya se envió hoy (idempotente entre reinicios)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new InMemorySummaryStateStore('2026-07-29'); // como tras un reinicio
    const result = await runDailySummaryTick({
      repository: fakeRepo([], []),
      userId: 'u1',
      store,
      send,
      hour: 9,
      now,
    });
    expect(result).toBe('already_sent_today');
    expect(send).not.toHaveBeenCalled();
  });

  it('dos ticks el mismo día solo envían una vez', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new InMemorySummaryStateStore();
    const deps = { repository: fakeRepo([], []),
      userId: 'u1', store, send, hour: 9, now };
    expect(await runDailySummaryTick(deps)).toBe('sent');
    expect(await runDailySummaryTick(deps)).toBe('already_sent_today');
    expect(send).toHaveBeenCalledOnce();
  });

  it('si el envío falla no marca el día (se reintenta luego)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('red caída'));
    const store = new InMemorySummaryStateStore();
    await expect(
      runDailySummaryTick({ repository: fakeRepo([], []),
      userId: 'u1', store, send, hour: 9, now }),
    ).rejects.toThrow('red caída');
    expect(store.lastSentDay()).toBeUndefined();
  });
});
