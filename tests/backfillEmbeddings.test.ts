import { describe, expect, it, vi } from 'vitest';
import { backfillEmbeddings, type BackfillablePrisma } from '../src/cli/backfillEmbeddings.js';
import type { Embedder } from '../src/ai/types.js';

interface Row {
  id: string;
  contenido: string;
  embedding: number[] | null;
}

/** Prisma falso en memoria: suficiente para probar backfillEmbeddings sin BD real. */
function fakePrisma(rows: Row[]): BackfillablePrisma {
  return {
    async $queryRaw() {
      return rows
        .filter((r) => r.embedding === null)
        .map((r) => ({ id: r.id, contenido: r.contenido })) as never;
    },
    async $executeRaw(_strings, ...values) {
      // Firma real: UPDATE ... SET embedding = ${literal}::vector WHERE id = ${id}
      const [literal, id] = values as [string, string];
      const row = rows.find((r) => r.id === id);
      if (row) row.embedding = JSON.parse(literal);
      return 1;
    },
  };
}

function stubEmbedder(fn: (text: string) => number[] | null): Embedder {
  return {
    embedDocument: vi.fn(async (text: string) => fn(text)),
    embedQuery: vi.fn(async (text: string) => fn(text)),
  };
}

describe('backfillEmbeddings', () => {
  it('genera y guarda el embedding solo de los mensajes que no lo tienen', async () => {
    const rows: Row[] = [
      { id: '1', contenido: 'comprar pan', embedding: null },
      { id: '2', contenido: 'ya tiene', embedding: [9, 9, 9] },
      { id: '3', contenido: 'llamar al dentista', embedding: null },
    ];
    const prisma = fakePrisma(rows);
    const embedder = stubEmbedder((text) => [text.length, 0, 0]);

    const result = await backfillEmbeddings(prisma, embedder, { delayMs: 0 });

    expect(result).toEqual({ total: 2, ok: 2, failed: 0 });
    expect(embedder.embedDocument).toHaveBeenCalledTimes(2);
    expect(embedder.embedDocument).not.toHaveBeenCalledWith('ya tiene');
    expect(rows[0]!.embedding).toEqual([11, 0, 0]);
    expect(rows[2]!.embedding).toEqual([18, 0, 0]);
    expect(rows[1]!.embedding).toEqual([9, 9, 9]); // no tocado
  });

  it('salta (sin lanzar) los mensajes cuyo embedding no se pudo generar', async () => {
    const rows: Row[] = [
      { id: '1', contenido: 'ok', embedding: null },
      { id: '2', contenido: 'falla', embedding: null },
    ];
    const prisma = fakePrisma(rows);
    const embedder = stubEmbedder((text) => (text === 'falla' ? null : [1]));

    const result = await backfillEmbeddings(prisma, embedder, { delayMs: 0 });

    expect(result).toEqual({ total: 2, ok: 1, failed: 1 });
    expect(rows[0]!.embedding).toEqual([1]);
    expect(rows[1]!.embedding).toBeNull();
  });

  it('no hace nada si no hay mensajes pendientes', async () => {
    const prisma = fakePrisma([{ id: '1', contenido: 'x', embedding: [1] }]);
    const embedder = stubEmbedder(() => [1]);

    const result = await backfillEmbeddings(prisma, embedder, { delayMs: 0 });

    expect(result).toEqual({ total: 0, ok: 0, failed: 0 });
    expect(embedder.embedDocument).not.toHaveBeenCalled();
  });

  it('informa el progreso a través de onProgress', async () => {
    const rows: Row[] = [{ id: '1', contenido: 'x', embedding: null }];
    const prisma = fakePrisma(rows);
    const embedder = stubEmbedder(() => [1]);
    const messages: string[] = [];

    await backfillEmbeddings(prisma, embedder, { delayMs: 0, onProgress: (m) => messages.push(m) });

    expect(messages.some((m) => m.includes('1 mensaje'))).toBe(true);
    expect(messages.some((m) => m.includes('hecho'))).toBe(true);
  });
});
