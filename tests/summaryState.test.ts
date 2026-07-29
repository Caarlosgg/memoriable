import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSummaryStateStore } from '../src/summary/summaryState.js';

describe('FileSummaryStateStore', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'summary-state-'));
    path = join(dir, 'state.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sin fichero devuelve undefined y no reporta error (primer arranque)', () => {
    let reported = false;
    const store = new FileSummaryStateStore(path, () => (reported = true));
    expect(store.lastSentDay()).toBeUndefined();
    expect(reported).toBe(false);
  });

  it('persiste la marca y la relee en una instancia nueva (sobrevive al reinicio)', () => {
    new FileSummaryStateStore(path).markSent('2026-07-29');
    // Instancia nueva = proceso reiniciado leyendo el mismo fichero.
    expect(new FileSummaryStateStore(path).lastSentDay()).toBe('2026-07-29');
  });

  it('un contenido corrupto se trata como sin marca en vez de romper', () => {
    const store = new FileSummaryStateStore(path);
    store.markSent('2026-07-29');
    rmSync(path);
    expect(store.lastSentDay()).toBeUndefined();
  });
});
