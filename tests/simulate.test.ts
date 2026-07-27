import { describe, expect, it } from 'vitest';
import { OfflineCategorizer } from '../src/ai/offlineCategorizer.js';
import { InMemoryMessageRepository } from '../src/db/repository.js';
import { runSimulation } from '../src/cli/simulate.js';

describe('runSimulation', () => {
  it('ejecuta el pipeline completo con un pipeline inyectado', async () => {
    const repository = new InMemoryMessageRepository();
    const stored = await runSimulation('Comprar leche', {
      categorizer: new OfflineCategorizer(),
      repository,
    });

    expect(stored.tipo).toBe('text');
    expect(stored.contenido).toBe('Comprar leche');
    expect(stored.categoria).toBe('tarea');
    expect(repository.all()).toHaveLength(1);
  });

  it('usa memoria y categorizador offline por defecto (sin servicios reales)', async () => {
    const stored = await runSimulation('¿Qué tal el día?');
    expect(stored.id).toMatch(/^mem_/);
    expect(stored.categoria).toBe('pregunta');
  });
});
