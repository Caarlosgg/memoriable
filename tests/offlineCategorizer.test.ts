import { describe, expect, it } from 'vitest';
import { OfflineCategorizer } from '../src/ai/offlineCategorizer.js';
import { CATEGORIES } from '../src/ai/types.js';

const cat = new OfflineCategorizer();

describe('OfflineCategorizer', () => {
  it('detecta preguntas', async () => {
    const { categoria } = await cat.analyze({ tipo: 'text', contenido: '¿Cómo estás?' });
    expect(categoria).toBe('pregunta');
  });

  it('detecta recordatorios', async () => {
    const { categoria } = await cat.analyze({
      tipo: 'text',
      contenido: 'Recuérdame llamar al médico mañana',
    });
    expect(categoria).toBe('recordatorio');
  });

  it('detecta tareas', async () => {
    const { categoria } = await cat.analyze({ tipo: 'text', contenido: 'Comprar pan y leche' });
    expect(categoria).toBe('tarea');
  });

  it('cae a "nota" para texto genérico', async () => {
    const { categoria } = await cat.analyze({ tipo: 'text', contenido: 'Hoy hace sol' });
    expect(categoria).toBe('nota');
  });

  it('siempre devuelve una categoría válida', async () => {
    const { categoria } = await cat.analyze({ tipo: 'text', contenido: 'texto cualquiera' });
    expect(CATEGORIES).toContain(categoria);
  });

  it('trunca resúmenes largos a 140 caracteres', async () => {
    const largo = 'a'.repeat(300);
    const { resumen } = await cat.analyze({ tipo: 'text', contenido: largo });
    expect(resumen.length).toBeLessThanOrEqual(140);
    expect(resumen.endsWith('...')).toBe(true);
  });
});
