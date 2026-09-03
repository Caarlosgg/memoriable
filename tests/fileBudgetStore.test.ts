import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileBudgetStore } from '../src/cost/fileBudgetStore.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'budget-store-'));
  file = join(dir, 'budget.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FileBudgetStore', () => {
  it('guarda un contador por usuario, sin que uno pise al otro', () => {
    const store = new FileBudgetStore(file);
    store.save({ day: '2026-09-03', used: 3 }, 'ana');
    store.save({ day: '2026-09-03', used: 7 }, 'bruno');

    expect(store.load('ana')).toEqual({ day: '2026-09-03', used: 3 });
    expect(store.load('bruno')).toEqual({ day: '2026-09-03', used: 7 });
  });

  it('sin sujeto usa un contador global aparte, para lo que no es de nadie', () => {
    const store = new FileBudgetStore(file);
    store.save({ day: '2026-09-03', used: 2 }, 'ana');
    store.save({ day: '2026-09-03', used: 9 });

    expect(store.load()).toEqual({ day: '2026-09-03', used: 9 });
    expect(store.load('ana')).toEqual({ day: '2026-09-03', used: 2 });
  });

  it('devuelve null para un usuario del que no hay nada guardado', () => {
    const store = new FileBudgetStore(file);
    store.save({ day: '2026-09-03', used: 1 }, 'ana');
    expect(store.load('nadie')).toBeNull();
  });

  it('adopta el formato antiguo ({day, used} suelto) como contador global', () => {
    // Actualizar la versión no debe perder la cuenta del día en curso ni
    // obligar a borrar el fichero a mano.
    writeFileSync(file, JSON.stringify({ day: '2026-09-03', used: 5 }), 'utf8');
    const store = new FileBudgetStore(file);
    expect(store.load()).toEqual({ day: '2026-09-03', used: 5 });
  });

  it('tira los contadores de días pasados al escribir, para que el fichero no crezca sin fin', () => {
    const store = new FileBudgetStore(file);
    store.save({ day: '2026-09-02', used: 4 }, 'viejo');
    store.save({ day: '2026-09-03', used: 1 }, 'ana');

    expect(store.load('viejo')).toBeNull();
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual(['ana']);
  });

  it('no lanza si el fichero no existe todavía (primer arranque)', () => {
    const store = new FileBudgetStore(join(dir, 'no-existe.json'));
    expect(store.load('ana')).toBeNull();
  });

  it('un fichero corrupto no tumba el procesamiento: se reporta y se sigue', () => {
    writeFileSync(file, 'esto no es json', 'utf8');
    const errores: unknown[] = [];
    const store = new FileBudgetStore(file, (err) => errores.push(err));

    expect(store.load('ana')).toBeNull();
    expect(errores).toHaveLength(1);
  });
});
