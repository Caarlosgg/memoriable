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
  it('guarda un contador por usuario, sin que uno pise al otro', async () => {
    const store = new FileBudgetStore(file);
    await store.save({ day: '2026-09-03', used: 3 }, 'ana');
    await store.save({ day: '2026-09-03', used: 7 }, 'bruno');

    expect(await store.load('ana')).toEqual({ day: '2026-09-03', used: 3 });
    expect(await store.load('bruno')).toEqual({ day: '2026-09-03', used: 7 });
  });

  it('sin sujeto usa un contador global aparte, para lo que no es de nadie', async () => {
    const store = new FileBudgetStore(file);
    await store.save({ day: '2026-09-03', used: 2 }, 'ana');
    await store.save({ day: '2026-09-03', used: 9 });

    expect(await store.load()).toEqual({ day: '2026-09-03', used: 9 });
    expect(await store.load('ana')).toEqual({ day: '2026-09-03', used: 2 });
  });

  it('devuelve null para un usuario del que no hay nada guardado', async () => {
    const store = new FileBudgetStore(file);
    await store.save({ day: '2026-09-03', used: 1 }, 'ana');
    expect(await store.load('nadie')).toBeNull();
  });

  it('adopta el formato antiguo ({day, used} suelto) como contador global', async () => {
    // Actualizar la versión no debe perder la cuenta del día en curso ni
    // obligar a borrar el fichero a mano.
    writeFileSync(file, JSON.stringify({ day: '2026-09-03', used: 5 }), 'utf8');
    const store = new FileBudgetStore(file);
    expect(await store.load()).toEqual({ day: '2026-09-03', used: 5 });
  });

  it('tira los contadores de días pasados al escribir, para que el fichero no crezca sin fin', async () => {
    const store = new FileBudgetStore(file);
    await store.save({ day: '2026-09-02', used: 4 }, 'viejo');
    await store.save({ day: '2026-09-03', used: 1 }, 'ana');

    expect(await store.load('viejo')).toBeNull();
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual(['ana']);
  });

  it('no lanza si el fichero no existe todavía (primer arranque)', async () => {
    const store = new FileBudgetStore(join(dir, 'no-existe.json'));
    expect(await store.load('ana')).toBeNull();
  });

  it('un fichero corrupto no tumba el procesamiento: se reporta y se sigue', async () => {
    writeFileSync(file, 'esto no es json', 'utf8');
    const errores: unknown[] = [];
    const store = new FileBudgetStore(file, (err) => errores.push(err));

    expect(await store.load('ana')).toBeNull();
    expect(errores).toHaveLength(1);
  });
});
