import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryMessageRepository } from '../src/db/repository.js';

let repo: InMemoryMessageRepository;

async function guardarNota(userId = 'ana') {
  return repo.save(userId, {
    tipo: 'text',
    contenido: 'Llamar al fontanero',
    categoria: 'tarea',
    resumen: 'Llamar al fontanero',
  });
}

beforeEach(() => {
  repo = new InMemoryMessageRepository();
});

describe('postpone', () => {
  it('pone la fecha límite de una nota propia', async () => {
    const nota = await guardarNota();
    const fecha = new Date('2026-09-10T23:59:59.999Z');

    const actualizada = await repo.postpone('ana', nota.id, fecha);

    expect(actualizada?.fechaLimite).toEqual(fecha);
  });

  it('quitar la fecha (null) es una operación válida, no un fallo', async () => {
    const nota = await guardarNota();
    await repo.postpone('ana', nota.id, new Date());

    const actualizada = await repo.postpone('ana', nota.id, null);

    expect(actualizada).not.toBeNull();
    expect(actualizada?.fechaLimite).toBeNull();
  });

  it('sobre una nota AJENA no hace nada y devuelve null (no lanza)', async () => {
    const nota = await guardarNota('ana');
    expect(await repo.postpone('bruno', nota.id, new Date())).toBeNull();
  });

  it('un id inventado devuelve null', async () => {
    expect(await repo.postpone('ana', 'no-existe', new Date())).toBeNull();
  });
});

describe('remove', () => {
  it('borra una nota propia y deja de encontrarse', async () => {
    const nota = await guardarNota();

    expect(await repo.remove('ana', nota.id)).toBe(true);
    expect(await repo.findById('ana', nota.id)).toBeNull();
  });

  it('NO borra la nota de otro usuario', async () => {
    const nota = await guardarNota('ana');

    expect(await repo.remove('bruno', nota.id)).toBe(false);
    // Y sigue ahí: el intento ajeno no puede tener ningún efecto.
    expect(await repo.findById('ana', nota.id)).not.toBeNull();
  });

  it('un id inventado devuelve false en vez de lanzar', async () => {
    expect(await repo.remove('ana', 'no-existe')).toBe(false);
  });
});

describe('findById', () => {
  it('devuelve la nota propia', async () => {
    const nota = await guardarNota();
    expect((await repo.findById('ana', nota.id))?.id).toBe(nota.id);
  });

  it('no deja leer la de otro usuario', async () => {
    const nota = await guardarNota('ana');
    expect(await repo.findById('bruno', nota.id)).toBeNull();
  });
});
