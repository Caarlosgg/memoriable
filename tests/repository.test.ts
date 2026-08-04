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
});
