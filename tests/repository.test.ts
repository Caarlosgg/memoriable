import { describe, expect, it } from 'vitest';
import { InMemoryMessageRepository } from '../src/db/repository.js';

describe('InMemoryMessageRepository', () => {
  it('guarda un registro y le asigna id y fecha', async () => {
    const repo = new InMemoryMessageRepository();
    const stored = await repo.save({
      tipo: 'text',
      contenido: 'hola',
      categoria: 'nota',
      resumen: 'saludo',
    });

    expect(stored.id).toMatch(/^mem_/);
    expect(stored.fecha).toBeInstanceOf(Date);
    expect(stored.contenido).toBe('hola');
    expect(stored.categoria).toBe('nota');
  });

  it('genera ids distintos e incrementales', async () => {
    const repo = new InMemoryMessageRepository();
    const a = await repo.save({ tipo: 'text', contenido: '1', categoria: 'nota', resumen: '1' });
    const b = await repo.save({ tipo: 'text', contenido: '2', categoria: 'nota', resumen: '2' });

    expect(a.id).not.toBe(b.id);
    expect(repo.all()).toHaveLength(2);
  });
});
