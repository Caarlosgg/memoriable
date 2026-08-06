import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileFocusStateStore, InMemoryFocusStateStore } from '../src/summary/focusState.js';

describe('InMemoryFocusStateStore', () => {
  it('sin ninguna marca, devuelve undefined', () => {
    expect(new InMemoryFocusStateStore().get(123)).toBeUndefined();
  });

  it('setAwaiting deja el chat esperando respuesta, sin texto', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(123, '2026-07-29');
    expect(store.get(123)).toEqual({ day: '2026-07-29', awaitingAnswer: true });
  });

  it('setAnswer guarda el texto y deja de esperar', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(123, '2026-07-29');
    store.setAnswer(123, '2026-07-29', 'Pagar la luz');
    expect(store.get(123)).toEqual({ day: '2026-07-29', awaitingAnswer: false, text: 'Pagar la luz' });
  });

  it('cada chat tiene su propio estado', () => {
    const store = new InMemoryFocusStateStore();
    store.setAwaiting(1, '2026-07-29');
    expect(store.get(2)).toBeUndefined();
  });
});

describe('FileFocusStateStore', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'focus-state-'));
    path = join(dir, 'state.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sin fichero devuelve undefined y no reporta error (primer arranque)', () => {
    let reported = false;
    const store = new FileFocusStateStore(path, () => (reported = true));
    expect(store.get(123)).toBeUndefined();
    expect(reported).toBe(false);
  });

  it('persiste "esperando respuesta" y la relee en una instancia nueva', () => {
    new FileFocusStateStore(path).setAwaiting(123, '2026-07-29');
    expect(new FileFocusStateStore(path).get(123)).toEqual({ day: '2026-07-29', awaitingAnswer: true });
  });

  it('persiste la respuesta ya contestada', () => {
    const store = new FileFocusStateStore(path);
    store.setAwaiting(123, '2026-07-29');
    store.setAnswer(123, '2026-07-29', 'Pagar la luz');
    expect(new FileFocusStateStore(path).get(123)).toEqual({
      day: '2026-07-29',
      awaitingAnswer: false,
      text: 'Pagar la luz',
    });
  });

  it('guarda el estado de varios chats en el mismo fichero sin pisarse', () => {
    const store = new FileFocusStateStore(path);
    store.setAwaiting(1, '2026-07-29');
    store.setAwaiting(2, '2026-07-29');
    store.setAnswer(1, '2026-07-29', 'Foco de uno');
    expect(store.get(1)?.text).toBe('Foco de uno');
    expect(store.get(2)).toEqual({ day: '2026-07-29', awaitingAnswer: true });
  });

  it('un contenido corrupto se trata como sin marca en vez de romper', () => {
    const store = new FileFocusStateStore(path);
    store.setAwaiting(123, '2026-07-29');
    rmSync(path);
    expect(store.get(123)).toBeUndefined();
  });
});
