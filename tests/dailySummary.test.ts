import { describe, expect, it, vi } from 'vitest';
import {
  buildDailySummary,
  dayKey,
  formatDailySummary,
  isAtOrAfterHour,
  pickFocusCandidates,
  runDailySummaryTick,
  todayRange,
  yesterdayRange,
} from '../src/summary/dailySummary.js';
import { InMemorySummaryStateStore } from '../src/summary/summaryState.js';
import { InMemoryFocusStateStore } from '../src/summary/focusState.js';
import type { MessageRepository, StoredMessage } from '../src/db/repository.js';
import type { EventRepository, EventSummary } from '../src/db/eventRepository.js';

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

function fakeEventRepo(eventos: EventSummary[]) {
  return {
    eventsBetween: vi.fn().mockResolvedValue(eventos),
  } satisfies EventRepository;
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

describe('todayRange', () => {
  it('devuelve el día natural de `now`, de medianoche a medianoche del día siguiente', () => {
    const now = new Date(2026, 6, 29, 9, 0);
    const { from, to } = todayRange(now);
    expect(from).toEqual(new Date(2026, 6, 29, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 6, 30, 0, 0, 0, 0));
  });
});

describe('isAtOrAfterHour', () => {
  it('true a partir de la hora, false antes', () => {
    expect(isAtOrAfterHour(new Date(2026, 6, 29, 9, 0), 9)).toBe(true);
    expect(isAtOrAfterHour(new Date(2026, 6, 29, 11, 30), 9)).toBe(true);
    expect(isAtOrAfterHour(new Date(2026, 6, 29, 8, 59), 9)).toBe(false);
  });
});

describe('pickFocusCandidates', () => {
  it('prioriza eventos de hoy (hasta 2) y rellena con pendientes hasta 3', () => {
    const eventos: EventSummary[] = [
      { titulo: 'Cita médica', fechaInicio: new Date() },
      { titulo: 'Reunión equipo', fechaInicio: new Date() },
      { titulo: 'Cena', fechaInicio: new Date() },
    ];
    const pending = [msg({ id: 'p1', resumen: 'Pagar la luz' }), msg({ id: 'p2', resumen: 'Llamar al banco' })];
    expect(pickFocusCandidates(pending, eventos)).toEqual(['Cita médica', 'Reunión equipo', 'Pagar la luz']);
  });

  it('sin eventos, rellena las 3 con los pendientes más recientes', () => {
    const pending = [
      msg({ id: 'p1', resumen: 'A' }),
      msg({ id: 'p2', resumen: 'B' }),
      msg({ id: 'p3', resumen: 'C' }),
      msg({ id: 'p4', resumen: 'D' }),
    ];
    expect(pickFocusCandidates(pending, [])).toEqual(['A', 'B', 'C']);
  });

  it('descarta pendientes sin resumen (no propone una candidata vacía)', () => {
    const pending = [msg({ id: 'p1', resumen: '' }), msg({ id: 'p2', resumen: 'Real' })];
    expect(pickFocusCandidates(pending, [])).toEqual(['Real']);
  });

  it('vacío si no hay ni eventos ni pendientes (no fuerza la conversación)', () => {
    expect(pickFocusCandidates([], [])).toEqual([]);
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
    const { text } = await buildDailySummary(repo, 'u1', now);
    expect(text).toContain('Pendientes');
    expect(text).toContain('Pagar la luz');
    expect(text).toContain('Guardado ayer');
    expect(text).toContain('Cena con Marta');
  });

  it('sin eventRepository, no falla y no propone eventos (compatible con el comportamiento anterior)', async () => {
    const now = new Date(2026, 6, 29, 9, 0);
    const repo = fakeRepo([], []);
    const { text, focusCandidates } = await buildDailySummary(repo, 'u1', now);
    expect(text).not.toContain('foco de hoy');
    expect(focusCandidates).toEqual([]);
  });

  it('con eventRepository, pide el rango de HOY y propone foco con eventos+pendientes', async () => {
    const now = new Date(2026, 6, 29, 9, 0);
    const repo = fakeRepo([msg({ id: 'p1', resumen: 'Pagar la luz' })], []);
    const eventRepo = fakeEventRepo([{ titulo: 'Cita médica', fechaInicio: now }]);

    const { text, focusCandidates } = await buildDailySummary(repo, 'u1', now, eventRepo);

    expect(eventRepo.eventsBetween).toHaveBeenCalledWith('u1', new Date(2026, 6, 29, 0, 0), new Date(2026, 6, 30, 0, 0));
    expect(focusCandidates).toEqual(['Cita médica', 'Pagar la luz']);
    expect(text).toContain('¿Cuál es tu foco de hoy?');
    expect(text).toContain('Cita médica');
  });
});

describe('formatDailySummary', () => {
  it('muestra notas amables cuando no hay nada', () => {
    const text = formatDailySummary({ pending: [], savedYesterday: [], now: new Date(2026, 6, 29) });
    expect(text).toContain('No tienes nada pendiente');
    expect(text).toContain('Ayer no guardaste nada');
  });

  it('sin candidatas de foco, no añade la sección de pregunta', () => {
    const text = formatDailySummary({ pending: [], savedYesterday: [], now: new Date(2026, 6, 29) });
    expect(text).not.toContain('foco de hoy');
  });

  it('con candidatas, añade la pregunta numerada', () => {
    const text = formatDailySummary({
      pending: [],
      savedYesterday: [],
      focusCandidates: ['Cita médica', 'Pagar la luz'],
      now: new Date(2026, 6, 29),
    });
    expect(text).toContain('1. Cita médica');
    expect(text).toContain('2. Pagar la luz');
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
      chatId: 123,
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
      chatId: 123,
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
      chatId: 123,
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
      userId: 'u1', chatId: 123, store, send, hour: 9, now };
    expect(await runDailySummaryTick(deps)).toBe('sent');
    expect(await runDailySummaryTick(deps)).toBe('already_sent_today');
    expect(send).toHaveBeenCalledOnce();
  });

  it('si el envío falla no marca el día (se reintenta luego)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('red caída'));
    const store = new InMemorySummaryStateStore();
    await expect(
      runDailySummaryTick({ repository: fakeRepo([], []),
      userId: 'u1', chatId: 123, store, send, hour: 9, now }),
    ).rejects.toThrow('red caída');
    expect(store.lastSentDay()).toBeUndefined();
  });

  it('con candidatas de foco, marca el chat como "esperando respuesta" en focusStore', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new InMemorySummaryStateStore();
    const focusStore = new InMemoryFocusStateStore();
    const eventRepo = fakeEventRepo([{ titulo: 'Cita médica', fechaInicio: now() }]);

    await runDailySummaryTick({
      repository: fakeRepo([], []),
      userId: 'u1',
      chatId: 123,
      store,
      focusStore,
      eventRepository: eventRepo,
      send,
      hour: 9,
      now,
    });

    expect(focusStore.get(123)).toEqual({ day: '2026-07-29', awaitingAnswer: true });
  });

  it('sin candidatas de foco, NO marca "esperando respuesta" (no fuerza la conversación)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new InMemorySummaryStateStore();
    const focusStore = new InMemoryFocusStateStore();

    await runDailySummaryTick({
      repository: fakeRepo([], []),
      userId: 'u1',
      chatId: 123,
      store,
      focusStore,
      send,
      hour: 9,
      now,
    });

    expect(focusStore.get(123)).toBeUndefined();
  });
});
