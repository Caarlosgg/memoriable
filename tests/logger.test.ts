import { describe, expect, it } from 'vitest';
import {
  createLogger,
  createMemoryLogger,
  errorContext,
  normalizeLevel,
  type LogRecord,
} from '../src/logging/logger.js';

describe('createLogger', () => {
  it('emite registros con timestamp, nivel y evento', () => {
    const records: LogRecord[] = [];
    const logger = createLogger({
      level: 'info',
      sink: (r) => records.push(r),
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });

    logger.info('message.processed', { categoria: 'tarea', durationMs: 12 });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      ts: '2026-01-01T00:00:00.000Z',
      level: 'info',
      event: 'message.processed',
      categoria: 'tarea',
      durationMs: 12,
    });
  });

  it('filtra los registros por debajo del nivel configurado', () => {
    const { logger, records } = createMemoryLogger('warn');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    expect(records.map((r) => r.event)).toEqual(['c', 'd']);
  });

  it('el logger hijo hereda y añade contexto', () => {
    const { logger, records } = createMemoryLogger();
    logger.child({ requestId: 'abc' }).info('evento', { extra: 1 });

    expect(records[0]).toMatchObject({ requestId: 'abc', extra: 1, event: 'evento' });
  });

  it('produce registros serializables a JSON', () => {
    const { logger, records } = createMemoryLogger();
    logger.info('evento', { anidado: { a: 1 } });
    expect(() => JSON.stringify(records[0])).not.toThrow();
  });
});

describe('normalizeLevel', () => {
  it('acepta niveles válidos y normaliza mayúsculas', () => {
    expect(normalizeLevel('debug')).toBe('debug');
    expect(normalizeLevel('WARN')).toBe('warn');
  });

  it('cae a info ante valores inválidos', () => {
    expect(normalizeLevel(undefined)).toBe('info');
    expect(normalizeLevel('ruidoso')).toBe('info');
  });
});

describe('errorContext', () => {
  it('serializa un Error con nombre y mensaje', () => {
    expect(errorContext(new TypeError('roto'))).toMatchObject({
      errorName: 'TypeError',
      errorMessage: 'roto',
    });
  });

  it('incluye status y code cuando existen (errores de API)', () => {
    const err = Object.assign(new Error('rate limit'), { status: 429, code: 'rate_limit' });
    expect(errorContext(err)).toMatchObject({ errorStatus: 429, errorCode: 'rate_limit' });
  });

  it('tolera valores que no son Error', () => {
    expect(errorContext('boom')).toMatchObject({ errorMessage: 'boom' });
  });
});
