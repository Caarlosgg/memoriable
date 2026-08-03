import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { env, hasGemini } from '../config/env.js';
import { GeminiEmbedder } from '../ai/embedder.js';
import type { Embedder } from '../ai/types.js';

/**
 * Subconjunto de PrismaClient que necesita el backfill. Tipado laxo a
 * propósito, igual que en db/prismaRepository.ts: `embedding` es
 * `Unsupported("vector(768)")`, así que solo se puede leer/escribir con
 * SQL crudo.
 */
export interface BackfillablePrisma {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

export interface BackfillResult {
  total: number;
  ok: number;
  failed: number;
}

const DEFAULT_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rellena el embedding de los mensajes que no lo tienen. Deliberadamente
 * secuencial (con una pequeña pausa entre llamadas) en vez de en paralelo:
 * es un script de mantenimiento puntual, no una ruta caliente — no merece
 * la pena arriesgarse a un 429 de la API gratuita de Gemini por ir más
 * rápido.
 */
export async function backfillEmbeddings(
  prisma: BackfillablePrisma,
  embedder: Embedder,
  options: { onProgress?: (message: string) => void; delayMs?: number } = {},
): Promise<BackfillResult> {
  const onProgress = options.onProgress ?? (() => {});
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  const pending = await prisma.$queryRaw<Array<{ id: string; contenido: string }>>`
    SELECT "id", "contenido" FROM "messages" WHERE "embedding" IS NULL ORDER BY "fecha" ASC
  `;

  onProgress(`${pending.length} mensaje(s) sin embedding.`);

  let ok = 0;
  let failed = 0;

  for (const [index, message] of pending.entries()) {
    const vector = await embedder.embedDocument(message.contenido);
    if (!vector) {
      failed++;
      onProgress(`[${index + 1}/${pending.length}] ${message.id}: no se pudo generar, se salta.`);
      continue;
    }

    const literal = `[${vector.join(',')}]`;
    await prisma.$executeRaw`UPDATE "messages" SET "embedding" = ${literal}::vector WHERE "id" = ${message.id}`;
    ok++;
    onProgress(`[${index + 1}/${pending.length}] ${message.id}: hecho.`);

    if (index < pending.length - 1) await sleep(delayMs);
  }

  return { total: pending.length, ok, failed };
}

async function main(): Promise<void> {
  if (!hasGemini()) {
    console.error('❌ Falta GEMINI_API_KEY: no se puede generar ningún embedding.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const embedder = new GeminiEmbedder(env.GEMINI_API_KEY!, {
    model: env.GEMINI_MODEL,
    onWarning: (message) => console.warn(`⚠️  ${message}`),
  });

  try {
    const result = await backfillEmbeddings(prisma, embedder, {
      onProgress: (message) => console.log(message),
    });
    console.log(
      `\n✅ Backfill terminado: ${result.ok} generado(s), ${result.failed} saltado(s) de ${result.total}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly =
  process.argv[1]?.endsWith('backfillEmbeddings.ts') || process.argv[1]?.endsWith('backfillEmbeddings.js');
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Error en el backfill:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
