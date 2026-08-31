import { describe, expect, it } from 'vitest';
import { InMemoryMessageRepository } from '../src/db/repository.js';

describe('InMemoryMessageRepository', () => {
  it('guarda un registro y le asigna id, fecha y dueño', async () => {
    const repo = new InMemoryMessageRepository();
    const stored = await repo.save('u1', {
      tipo: 'text',
      contenido: 'hola',
      categoria: 'nota',
      resumen: 'saludo',
    });

    expect(stored.id).toMatch(/^mem_/);
    expect(stored.fecha).toBeInstanceOf(Date);
    expect(stored.contenido).toBe('hola');
    expect(stored.categoria).toBe('nota');
    expect(stored.userId).toBe('u1');
  });

  it('genera ids distintos e incrementales', async () => {
    const repo = new InMemoryMessageRepository();
    const a = await repo.save('u1', { tipo: 'text', contenido: '1', categoria: 'nota', resumen: '1' });
    const b = await repo.save('u1', { tipo: 'text', contenido: '2', categoria: 'nota', resumen: '2' });

    expect(a.id).not.toBe(b.id);
    expect(repo.all()).toHaveLength(2);
  });

  it('aísla las notas por usuario: cada uno ve solo las suyas', async () => {
    const repo = new InMemoryMessageRepository();
    await repo.save('u1', { tipo: 'text', contenido: 'de u1', categoria: 'nota', resumen: 'x' });
    await repo.save('u2', { tipo: 'text', contenido: 'de u2', categoria: 'nota', resumen: 'x' });

    expect((await repo.search('u1', 'de')).map((m) => m.contenido)).toEqual(['de u1']);
    expect((await repo.search('u2', 'de')).map((m) => m.contenido)).toEqual(['de u2']);
  });

  it('markDone marca la nota como hecha y devuelve el registro actualizado', async () => {
    const repo = new InMemoryMessageRepository();
    const stored = await repo.save('u1', { tipo: 'text', contenido: 'llamar', categoria: 'tarea', resumen: 'llamar' });

    const updated = await repo.markDone('u1', stored.id);

    expect(updated?.hecho).toBe(true);
    expect(repo.all().find((m) => m.id === stored.id)?.hecho).toBe(true);
  });

  it('markDone con un id ajeno o inventado no toca nada y devuelve null', async () => {
    const repo = new InMemoryMessageRepository();
    const stored = await repo.save('u1', { tipo: 'text', contenido: 'llamar', categoria: 'tarea', resumen: 'llamar' });

    await expect(repo.markDone('u2', stored.id)).resolves.toBeNull();
    await expect(repo.markDone('u1', 'inventado')).resolves.toBeNull();
    expect(repo.all().find((m) => m.id === stored.id)?.hecho).toBe(false);
  });

  it('recategorize cambia SOLO la categoría, sin tocar el resumen ni el contenido', async () => {
    const repo = new InMemoryMessageRepository();
    const stored = await repo.save('u1', { tipo: 'text', contenido: 'ir al banco', categoria: 'nota', resumen: 'ir al banco' });

    const updated = await repo.recategorize('u1', stored.id, 'tarea');

    expect(updated?.categoria).toBe('tarea');
    expect(updated?.resumen).toBe('ir al banco');
    expect(updated?.contenido).toBe('ir al banco');
  });

  it('recategorize con un id ajeno o inventado no toca nada y devuelve null', async () => {
    const repo = new InMemoryMessageRepository();
    const stored = await repo.save('u1', { tipo: 'text', contenido: 'x', categoria: 'nota', resumen: 'x' });

    await expect(repo.recategorize('u2', stored.id, 'tarea')).resolves.toBeNull();
    expect(repo.all().find((m) => m.id === stored.id)?.categoria).toBe('nota');
  });
});
