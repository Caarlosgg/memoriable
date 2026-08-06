import { describe, expect, it, vi } from 'vitest';
import {
  buildCandidates,
  parseBriefing,
  OfflineBriefingGenerator,
  GroqBriefingGenerator,
  type BriefingCandidate,
} from '../src/ai/briefing.js';
import type { StoredMessage } from '../src/db/repository.js';
import type { EventSummary } from '../src/db/eventRepository.js';

function msg(overrides: Partial<StoredMessage> & { id: string }): StoredMessage {
  return {
    tipo: 'text',
    contenido: '',
    categoria: 'tarea',
    resumen: '',
    hecho: false,
    fecha: new Date('2026-08-01T00:00:00.000Z'),
    userId: 'u1',
    ...overrides,
  };
}

describe('buildCandidates', () => {
  it('numera eventos primero, luego pendientes, en orden', () => {
    const eventos: EventSummary[] = [{ titulo: 'Cita médica', fechaInicio: new Date('2026-08-06T10:00:00.000Z') }];
    const pending = [msg({ id: 'p1', resumen: 'Pagar la luz' }), msg({ id: 'p2', resumen: 'Llamar al banco' })];

    const candidates = buildCandidates(pending, eventos);

    expect(candidates.map((c) => c.index)).toEqual([1, 2, 3]);
    expect(candidates[0]!.label).toContain('Cita médica');
    expect(candidates[0]!.messageId).toBeUndefined();
    expect(candidates[1]!.messageId).toBe('p1');
    expect(candidates[2]!.messageId).toBe('p2');
  });

  it('sin nada, devuelve un array vacío', () => {
    expect(buildCandidates([], [])).toEqual([]);
  });
});

describe('OfflineBriefingGenerator', () => {
  const now = new Date('2026-08-06T09:00:00.000Z');

  it('sin pendientes ni eventos, dice honestamente que es día libre', async () => {
    const gen = new OfflineBriefingGenerator();
    const result = await gen.generate({ pending: [], eventosHoy: [], now });
    expect(result.misionPrincipal).toMatch(/día libre|nada pendiente/i);
    expect(result.misionPrincipalMessageId).toBeUndefined();
  });

  it('con un evento hoy, lo elige como misión principal', async () => {
    const gen = new OfflineBriefingGenerator();
    const result = await gen.generate({
      pending: [],
      eventosHoy: [{ titulo: 'Cita médica', fechaInicio: now }],
      now,
    });
    expect(result.misionPrincipal).toContain('Cita médica');
  });

  it('con pendientes, la primera pasa a ser la misión principal y trae su id', async () => {
    const gen = new OfflineBriefingGenerator();
    const result = await gen.generate({
      pending: [msg({ id: 'p1', resumen: 'Pagar la luz' })],
      eventosHoy: [],
      now,
    });
    expect(result.misionPrincipal).toContain('Pagar la luz');
    expect(result.misionPrincipalMessageId).toBe('p1');
  });

  it('avisa de sobrecarga con muchos pendientes', async () => {
    const gen = new OfflineBriefingGenerator();
    const pending = Array.from({ length: 10 }, (_, i) => msg({ id: `p${i}`, resumen: `Tarea ${i}` }));
    const result = await gen.generate({ pending, eventosHoy: [], now });
    expect(result.advertencias.some((a) => a.includes('10 pendientes'))).toBe(true);
  });

  it('avisa de una tarea atascada (5+ días sin moverse)', async () => {
    const gen = new OfflineBriefingGenerator();
    const vieja = msg({ id: 'p1', resumen: 'Renovar el DNI', fecha: new Date('2026-07-30T00:00:00.000Z') });
    const result = await gen.generate({ pending: [vieja], eventosHoy: [], now });
    expect(result.advertencias.some((a) => a.includes('Renovar el DNI'))).toBe(true);
  });

  it('sin sobrecarga ni tareas atascadas, no inventa advertencias', async () => {
    const gen = new OfflineBriefingGenerator();
    const result = await gen.generate({
      pending: [msg({ id: 'p1', resumen: 'Reciente', fecha: new Date('2026-08-05T00:00:00.000Z') })],
      eventosHoy: [],
      now,
    });
    expect(result.advertencias).toEqual([]);
  });
});

describe('parseBriefing', () => {
  const candidates: BriefingCandidate[] = [
    { index: 1, label: '(evento, 10:00) Cita médica' },
    { index: 2, label: '(tarea) Pagar la luz', messageId: 'p1' },
  ];

  it('resuelve el índice elegido contra la candidata real (nunca confía en texto libre)', () => {
    const raw = JSON.stringify({
      mision_principal_indice: 2,
      bloque_manana: ['Pagar la luz'],
      bloque_tarde: [],
      advertencias: [],
    });
    const result = parseBriefing(raw, candidates);
    expect(result.misionPrincipal).toBe('Pagar la luz');
    expect(result.misionPrincipalMessageId).toBe('p1');
  });

  it('un índice fuera de rango cae a la primera candidata, sin lanzar', () => {
    const raw = JSON.stringify({ mision_principal_indice: 99, bloque_manana: [], bloque_tarde: [], advertencias: [] });
    const result = parseBriefing(raw, candidates);
    expect(result.misionPrincipal).toContain('Cita médica');
  });

  it('arrays con tipos raros se tratan como vacíos, sin lanzar', () => {
    const raw = JSON.stringify({ mision_principal_indice: 1, bloque_manana: 'no es un array', advertencias: [1, 2, null] });
    const result = parseBriefing(raw, candidates);
    expect(result.bloqueManana).toEqual([]);
    expect(result.advertencias).toEqual([]);
  });

  it('sin candidatas, la misión es el mensaje de día libre', () => {
    const raw = JSON.stringify({ mision_principal_indice: 0, bloque_manana: [], bloque_tarde: [], advertencias: [] });
    const result = parseBriefing(raw, []);
    expect(result.misionPrincipal).toMatch(/día libre/i);
  });

  it('un JSON inválido lanza (lo capta la capa resiliente, no aquí)', () => {
    expect(() => parseBriefing('esto no es JSON', candidates)).toThrow();
  });
});

describe('GroqBriefingGenerator', () => {
  it('manda las candidatas numeradas y devuelve el resultado ya resuelto', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mision_principal_indice: 1,
              bloque_manana: ['Pagar la luz'],
              bloque_tarde: [],
              advertencias: [],
            }),
          },
        },
      ],
    });
    const client = { chat: { completions: { create } } };
    const gen = new GroqBriefingGenerator(client, 'modelo-de-prueba');

    const result = await gen.generate({
      pending: [msg({ id: 'p1', resumen: 'Pagar la luz' })],
      eventosHoy: [],
      now: new Date('2026-08-06T09:00:00.000Z'),
    });

    expect(create).toHaveBeenCalledOnce();
    const args = create.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    expect(args.messages[1]!.content).toContain('Pagar la luz');
    expect(result.misionPrincipal).toBe('Pagar la luz');
    expect(result.misionPrincipalMessageId).toBe('p1');
  });

  it('propaga el error si Groq falla (la capa resiliente decide qué hacer)', async () => {
    const client = { chat: { completions: { create: vi.fn().mockRejectedValue(new Error('rate limited')) } } };
    const gen = new GroqBriefingGenerator(client, 'modelo-de-prueba');
    await expect(gen.generate({ pending: [], eventosHoy: [], now: new Date() })).rejects.toThrow('rate limited');
  });
});
